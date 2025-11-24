const { getConnection } = require('../config/database');

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

const normalizePositiveInt = (value, fallback = 1) => {
    const numeric = Number.parseInt(value, 10);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const toPrice = (value) => {
    const numeric = Number.parseFloat(value);
    return Number.isFinite(numeric) && numeric >= 0 ? Number(numeric.toFixed(2)) : 0;
};

const mapCartRow = (row) => ({
    cartItemId: row.id,
    modelId: row.model_id,
    name: row.name,
    description: row.description,
    previewUrl: row.preview_url || row.thumbnail_url || null,
    quantity: normalizePositiveInt(row.quantity, 1),
    unitPrice: toPrice(row.unit_price),
    lineTotal: toPrice(row.line_total)
});

const buildCartSummary = (rows) => {
    const items = rows.map(mapCartRow);
    const totals = items.reduce((acc, item) => {
        acc.itemCount += 1;
        acc.totalQuantity += item.quantity;
        acc.subtotal = toPrice(acc.subtotal + item.lineTotal);
        return acc;
    }, { itemCount: 0, totalQuantity: 0, subtotal: 0 });

    return { items, totals };
};

const fetchCartSummary = async (connection, userId) => {
    const [rows] = await connection.execute(
        `SELECT 
            ci.id,
            ci.model_id,
            ci.quantity,
            ci.unit_price,
            (ci.quantity * ci.unit_price) AS line_total,
            m.name,
            m.description,
            m.preview_url,
            m.thumbnail_url
        FROM cart_items ci
        INNER JOIN 3d_models m ON m.id = ci.model_id
        WHERE ci.user_id = ?
        ORDER BY ci.updated_at DESC`,
        [userId]
    );

    return buildCartSummary(rows);
};

const addToCart = async (req, res) => {
    let connection;
    try {
        const { userId, modelId, quantity, notes, unitPrice: providedUnitPrice } = req.body || {};
        const normalizedUserId = ensureUserContext(req, userId);
        const normalizedModelId = Number.parseInt(modelId, 10);
        const normalizedQuantity = normalizePositiveInt(quantity, 1);

        if (!Number.isFinite(normalizedModelId) || normalizedModelId <= 0) {
            return res.status(400).json({ success: false, message: 'A valid modelId is required.' });
        }

        connection = await getConnection();

        const [models] = await connection.execute(
            `SELECT id, name, estimated_price, preview_url, thumbnail_url, description
             FROM 3d_models
             WHERE id = ?
             LIMIT 1`,
            [normalizedModelId]
        );

        if (!models || models.length === 0) {
            return res.status(404).json({ success: false, message: 'Model not found.' });
        }

        const model = models[0];
        const unitPrice = toPrice(
            providedUnitPrice ?? model.estimated_price ?? model.price ?? 0
        );
        const trimmedNotes = typeof notes === 'string' ? notes.trim().slice(0, 255) : null;

        await connection.execute(
            `INSERT INTO cart_items (user_id, model_id, quantity, unit_price, notes)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                quantity = cart_items.quantity + VALUES(quantity),
                unit_price = VALUES(unit_price),
                notes = VALUES(notes),
                updated_at = CURRENT_TIMESTAMP`,
            [normalizedUserId, normalizedModelId, normalizedQuantity, unitPrice, trimmedNotes]
        );

        const cart = await fetchCartSummary(connection, normalizedUserId);

        res.json({
            success: true,
            message: 'Item added to cart.',
            cart: {
                userId: normalizedUserId,
                ...cart
            }
        });
    } catch (error) {
        console.error('Add to cart error:', error);
        const status = error.statusCode || 500;
        res.status(status).json({ success: false, message: error.statusCode ? error.message : 'Failed to add item to cart.', error: error.message });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

const getCart = async (req, res) => {
    let connection;
    try {
        const { userId } = req.params;
        const normalizedUserId = ensureUserContext(req, userId);

        connection = await getConnection();
        const cart = await fetchCartSummary(connection, normalizedUserId);

        res.json({
            success: true,
            cart: {
                userId: normalizedUserId,
                ...cart
            }
        });
    } catch (error) {
        console.error('Get cart error:', error);
        const status = error.statusCode || 500;
        res.status(status).json({ success: false, message: error.statusCode ? error.message : 'Failed to load cart.', error: error.message });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

const updateCartItem = async (req, res) => {
    let connection;
    try {
        const { cartItemId, userId, quantity } = req.body || {};
        const normalizedCartItemId = Number.parseInt(cartItemId, 10);
        const normalizedUserId = ensureUserContext(req, userId);
        const normalizedQuantity = Number.parseInt(quantity, 10);

        if (!Number.isFinite(normalizedCartItemId) || normalizedCartItemId <= 0) {
            return res.status(400).json({ success: false, message: 'A valid cartItemId is required.' });
        }

        if (!Number.isFinite(normalizedQuantity)) {
            return res.status(400).json({ success: false, message: 'A valid quantity is required.' });
        }

        connection = await getConnection();

        if (normalizedQuantity <= 0) {
            const [result] = await connection.execute(
                `DELETE FROM cart_items WHERE id = ? AND user_id = ?`,
                [normalizedCartItemId, normalizedUserId]
            );

            if (!result.affectedRows) {
                return res.status(404).json({ success: false, message: 'Cart item not found.' });
            }
        } else {
            const [result] = await connection.execute(
                `UPDATE cart_items
                 SET quantity = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ? AND user_id = ?`,
                [normalizedQuantity, normalizedCartItemId, normalizedUserId]
            );

            if (!result.affectedRows) {
                return res.status(404).json({ success: false, message: 'Cart item not found.' });
            }
        }

        const cart = await fetchCartSummary(connection, normalizedUserId);

        res.json({
            success: true,
            message: 'Cart updated successfully.',
            cart: {
                userId: normalizedUserId,
                ...cart
            }
        });
    } catch (error) {
        console.error('Update cart error:', error);
        const status = error.statusCode || 500;
        res.status(status).json({ success: false, message: error.statusCode ? error.message : 'Failed to update cart.', error: error.message });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

const removeCartItem = async (req, res) => {
    let connection;
    try {
        const { cartItemId } = req.params;
        const { userId: queryUserId } = req.query;
        const bodyUserId = req.body?.userId;
        const normalizedCartItemId = Number.parseInt(cartItemId, 10);
        const normalizedUserId = ensureUserContext(req, queryUserId ?? bodyUserId);

        if (!Number.isFinite(normalizedCartItemId) || normalizedCartItemId <= 0) {
            return res.status(400).json({ success: false, message: 'A valid cartItemId is required.' });
        }

        connection = await getConnection();
        const [result] = await connection.execute(
            `DELETE FROM cart_items WHERE id = ? AND user_id = ?`,
            [normalizedCartItemId, normalizedUserId]
        );

        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: 'Cart item not found.' });
        }

        const cart = await fetchCartSummary(connection, normalizedUserId);

        res.json({
            success: true,
            message: 'Item removed from cart.',
            cart: {
                userId: normalizedUserId,
                ...cart
            }
        });
    } catch (error) {
        console.error('Remove cart item error:', error);
        const status = error.statusCode || 500;
        res.status(status).json({ success: false, message: error.statusCode ? error.message : 'Failed to remove item from cart.', error: error.message });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

const clearCart = async (req, res) => {
    let connection;
    try {
        const { userId } = req.params;
        const normalizedUserId = ensureUserContext(req, userId);

        connection = await getConnection();
        await connection.execute(
            `DELETE FROM cart_items WHERE user_id = ?`,
            [normalizedUserId]
        );

        res.json({ success: true, message: 'Cart cleared successfully.' });
    } catch (error) {
        console.error('Clear cart error:', error);
        const status = error.statusCode || 500;
        res.status(status).json({ success: false, message: error.statusCode ? error.message : 'Failed to clear cart.', error: error.message });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

module.exports = {
    addToCart,
    getCart,
    updateCartItem,
    removeCartItem,
    clearCart
};
