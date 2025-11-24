const { getConnection } = require('../config/database');

const ORDER_STATUS_STEPS = ['order_placed', 'payment_confirmed', 'shipped', 'out_for_delivery', 'delivered'];
const STATUS_LABELS = {
    order_placed: 'Order Placed',
    payment_confirmed: 'Payment Confirmed',
    shipped: 'Shipped',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered'
};

const normalizeUserId = (value) => {
    const numeric = Number.parseInt(value, 10);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const getTokenUserId = (req) => normalizeUserId(req.user?.id ?? req.user?.userId);

const hasAdminRole = (req) => {
    const role = (req.user?.userType || req.user?.role || '').toLowerCase();
    return role === 'admin';
};

const resolveTargetUserId = (req, providedId) => {
    const tokenUserId = getTokenUserId(req);
    const sanitizedProvided = normalizeUserId(providedId);

    if (tokenUserId && sanitizedProvided && tokenUserId !== sanitizedProvided && !hasAdminRole(req)) {
        const error = new Error('You are not allowed to act on behalf of another user.');
        error.statusCode = 403;
        throw error;
    }

    return tokenUserId || sanitizedProvided;
};

const ensureUserContext = (req, providedId) => {
    const targetUserId = resolveTargetUserId(req, providedId);
    if (!targetUserId) {
        const error = new Error('A valid userId is required.');
        error.statusCode = 400;
        throw error;
    }
    return targetUserId;
};

const ensureOrderOwnership = (req, orderUserId) => {
    const tokenUserId = getTokenUserId(req);
    if (tokenUserId && orderUserId && tokenUserId !== orderUserId && !hasAdminRole(req)) {
        const error = new Error('You are not allowed to view this order.');
        error.statusCode = 403;
        throw error;
    }
};

const toPrice = (value) => {
    const numeric = Number.parseFloat(value);
    return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : 0;
};

const parseShippingAddress = (input) => {
    if (!input) {
        return null;
    }

    if (typeof input === 'object') {
        try {
            return JSON.stringify(input);
        } catch (error) {
            return null;
        }
    }

    if (typeof input === 'string' && input.trim()) {
        return JSON.stringify({ text: input.trim() });
    }

    return null;
};

const deserializeShippingAddress = (value) => {
    if (!value) {
        return null;
    }

    try {
        if (typeof value === 'object') {
            return value;
        }
        return JSON.parse(value);
    } catch (error) {
        return { text: String(value) };
    }
};

const buildTimeline = (currentStatus, historyRows = []) => {
    return ORDER_STATUS_STEPS.map((statusKey) => {
        const historyEntry = historyRows.find((entry) => entry.status === statusKey) || null;
        const timestamp = (() => {
            if (!historyEntry || !historyEntry.created_at) {
                return null;
            }
            if (historyEntry.created_at instanceof Date) {
                return historyEntry.created_at.toISOString();
            }
            const parsed = new Date(historyEntry.created_at);
            return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
        })();

        return {
            status: statusKey,
            label: STATUS_LABELS[statusKey],
            timestamp,
            details: historyEntry?.details || null,
            completed: Boolean(historyEntry)
        };
    }).map((step, index, steps) => {
        if (!step.completed && currentStatus) {
            const currentIndex = ORDER_STATUS_STEPS.indexOf(currentStatus);
            if (currentIndex >= index) {
                return { ...step, completed: true };
            }
        }
        return step;
    });
};

const checkout = async (req, res) => {
    let connection;
    try {
        const { userId, shippingAddress, paymentMethod, notes } = req.body || {};
        const normalizedUserId = ensureUserContext(req, userId);

        connection = await getConnection();
        await connection.beginTransaction();

        const [cartRows] = await connection.execute(
            `SELECT ci.id, ci.model_id, ci.quantity, ci.unit_price, m.name
             FROM cart_items ci
             INNER JOIN 3d_models m ON m.id = ci.model_id
             WHERE ci.user_id = ?
             FOR UPDATE`,
            [normalizedUserId]
        );

        if (!cartRows || cartRows.length === 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Cart is empty.' });
        }

        const cartItems = cartRows.map((row) => ({
            modelId: row.model_id,
            quantity: Number.parseInt(row.quantity, 10) || 1,
            unitPrice: toPrice(row.unit_price),
            name: row.name
        }));

        const orderTotal = toPrice(
            cartItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)
        );

        const shippingJson = parseShippingAddress(shippingAddress);
        const trimmedPaymentMethod = typeof paymentMethod === 'string' ? paymentMethod.trim().slice(0, 100) : null;
        const sanitizedNotes = typeof notes === 'string' ? notes.trim() : null;

        const [orderResult] = await connection.execute(
            `INSERT INTO orders (
                user_id,
                status,
                total_amount,
                shipping_address,
                payment_method,
                payment_status,
                notes
            ) VALUES (?, 'order_placed', ?, ?, ?, 'pending', ?)` ,
            [normalizedUserId, orderTotal, shippingJson, trimmedPaymentMethod, sanitizedNotes]
        );

        const orderId = orderResult.insertId;

        const orderItemValues = cartItems.map(() => '(?, ?, ?, ?, ?)').join(', ');
        const orderItemParams = cartItems.flatMap((item) => [
            orderId,
            item.modelId,
            item.quantity,
            item.unitPrice,
            toPrice(item.unitPrice * item.quantity)
        ]);

        await connection.execute(
            `INSERT INTO order_items (
                order_id,
                model_id,
                quantity,
                unit_price,
                line_total
            ) VALUES ${orderItemValues}`,
            orderItemParams
        );

        await connection.execute(
            `INSERT INTO order_status_history (order_id, status, details)
             VALUES (?, 'order_placed', 'Order created successfully.')`,
            [orderId]
        );

        await connection.execute(
            `DELETE FROM cart_items WHERE user_id = ?`,
            [normalizedUserId]
        );

        await connection.commit();

        res.status(201).json({
            success: true,
            orderId,
            status: 'order_placed'
        });
    } catch (error) {
        if (connection) {
            await connection.rollback().catch(() => {});
        }
        console.error('Checkout error:', error);
        const status = error.statusCode || 500;
        res.status(status).json({ success: false, message: error.statusCode ? error.message : 'Checkout failed.', error: error.message });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

const getOrderById = async (req, res) => {
    let connection;
    try {
        const { orderId } = req.params;
        const normalizedOrderId = Number.parseInt(orderId, 10);

        if (!Number.isFinite(normalizedOrderId) || normalizedOrderId <= 0) {
            return res.status(400).json({ success: false, message: 'A valid orderId is required.' });
        }

        connection = await getConnection();

        const [orders] = await connection.execute(
            `SELECT * FROM orders WHERE id = ? LIMIT 1`,
            [normalizedOrderId]
        );

        if (!orders || orders.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        const order = orders[0];

        ensureOrderOwnership(req, order.user_id);

        const [items] = await connection.execute(
            `SELECT oi.id, oi.model_id, oi.quantity, oi.unit_price, oi.line_total, m.name, m.preview_url
             FROM order_items oi
             INNER JOIN 3d_models m ON m.id = oi.model_id
             WHERE oi.order_id = ?
             ORDER BY oi.id ASC`,
            [normalizedOrderId]
        );

        const [history] = await connection.execute(
            `SELECT status, details, created_at
             FROM order_status_history
             WHERE order_id = ?
             ORDER BY created_at ASC`,
            [normalizedOrderId]
        );

        const serializedOrder = {
            id: order.id,
            userId: order.user_id,
            status: order.status,
            totalAmount: toPrice(order.total_amount),
            paymentStatus: order.payment_status,
            paymentMethod: order.payment_method,
            notes: order.notes,
            createdAt: order.created_at instanceof Date ? order.created_at.toISOString() : order.created_at,
            updatedAt: order.updated_at instanceof Date ? order.updated_at.toISOString() : order.updated_at,
            shippingAddress: deserializeShippingAddress(order.shipping_address),
            items: items.map((item) => ({
                orderItemId: item.id,
                modelId: item.model_id,
                name: item.name,
                previewUrl: item.preview_url,
                quantity: Number.parseInt(item.quantity, 10) || 1,
                unitPrice: toPrice(item.unit_price),
                lineTotal: toPrice(item.line_total)
            }))
        };

        const timeline = buildTimeline(order.status, history.map((entry) => ({
            status: entry.status,
            details: entry.details,
            created_at: entry.created_at
        })));

        res.json({ success: true, order: serializedOrder, timeline });
    } catch (error) {
        console.error('Get order error:', error);
        const status = error.statusCode || 500;
        res.status(status).json({ success: false, message: error.statusCode ? error.message : 'Failed to load order.', error: error.message });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

const getOrdersForUser = async (req, res) => {
    let connection;
    try {
        const { userId } = req.params;
        const normalizedUserId = ensureUserContext(req, userId);

        connection = await getConnection();

        const [orders] = await connection.execute(
            `SELECT id, status, total_amount, payment_status, payment_method, shipping_address, created_at, updated_at
             FROM orders
             WHERE user_id = ?
             ORDER BY created_at DESC`,
            [normalizedUserId]
        );

        const serializedOrders = orders.map((order) => ({
            id: order.id,
            status: order.status,
            totalAmount: toPrice(order.total_amount),
            paymentStatus: order.payment_status,
            paymentMethod: order.payment_method,
            createdAt: order.created_at instanceof Date ? order.created_at.toISOString() : order.created_at,
            updatedAt: order.updated_at instanceof Date ? order.updated_at.toISOString() : order.updated_at,
            shippingAddress: deserializeShippingAddress(order.shipping_address)
        }));

        res.json({
            success: true,
            userId: normalizedUserId,
            orders: serializedOrders
        });
    } catch (error) {
        console.error('Get orders for user error:', error);
        const status = error.statusCode || 500;
        res.status(status).json({ success: false, message: error.statusCode ? error.message : 'Failed to load orders.', error: error.message });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

module.exports = {
    checkout,
    getOrderById,
    getOrdersForUser
};
