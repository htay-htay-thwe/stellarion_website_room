// ============================================
// STELLARION - FULL STACK BACKEND SERVER
// Node.js Express Server with MySQL Database & Meshy API
// ============================================

const { randomUUID, randomBytes } = require('crypto');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const FormData = require('form-data');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const { authenticateToken, optionalAuth } = require('./middleware/auth');
require('dotenv').config();

// Database connection
const { testConnection, initializeDatabase, getConnection } = require('./config/database');

// Import routes
const userRoutes = require('./routes/users');
const companyRoutes = require('./routes/companies');
const companyRegistrationRoutes = require('./routes/companyRegistration');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');

const app = express();
const PORT = process.env.PORT || 3000;

// Meshy AI API Configuration
const MESHY_API_KEY = process.env.MESHY_API_KEY || 'msy_BO62XMcAXyvcYttvXRLCQx4OSnyKJaUHCoOG';
const MESHY_API_BASE = process.env.MESHY_API_BASE || 'https://api.meshy.ai/openapi/v1/image-to-3d';

// Local storage for cached model assets
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const MODEL_UPLOAD_DIR = path.join(UPLOADS_DIR, 'models');
fs.mkdirSync(MODEL_UPLOAD_DIR, { recursive: true });

const ALLOWED_PROXY_HOSTS = new Set(['assets.meshy.ai', 'cdn.meshy.ai']);

const SHARE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const ensureShareLinkTemplate = (input, { fallbackPath } = { fallbackPath: '/view-room.html?code={code}' }) => {
    if (typeof input !== 'string') {
        return null;
    }

    const trimmed = input.trim();
    if (!trimmed) {
        return null;
    }

    const adjusted = trimmed.replace(/room-share(?:\.html?)?/i, 'view-room.html');

    if (adjusted.includes('{code}')) {
        return adjusted;
    }

    const hasQuery = adjusted.includes('?');

    if (hasQuery) {
        if (/[?&]code=$/i.test(adjusted)) {
            return `${adjusted}{code}`;
        }
        if (/[?&]$/.test(adjusted)) {
            return `${adjusted}code={code}`;
        }
        if (/[?&][^=]+=$/.test(adjusted)) {
            return `${adjusted}{code}`;
        }
        if (/[?&]code=/i.test(adjusted)) {
            return adjusted.endsWith('=') ? `${adjusted}{code}` : `${adjusted}`;
        }
        return `${adjusted}&code={code}`;
    }

    const normalized = adjusted.replace(/\/$/, '');

    if (/\.html?$/i.test(normalized)) {
        return `${normalized}?code={code}`;
    }

    return `${normalized}${fallbackPath}`;
};

const deriveShareLinkTemplate = () => {
    const configured = process.env.ROOM_SHARE_LINK_ROOT || process.env.ROOM_SHARE_URL;
    const templateFromEnv = ensureShareLinkTemplate(configured || '');
    if (templateFromEnv) {
        return templateFromEnv;
    }

    const frontend = process.env.FRONTEND_URL;
    if (frontend && typeof frontend === 'string') {
        const normalizedFrontend = frontend.trim().replace(/\/$/, '');
        const templateFromFrontend = ensureShareLinkTemplate(`${normalizedFrontend}/view-room.html`);
        if (templateFromFrontend) {
            return templateFromFrontend;
        }
    }

    return 'https://stellarion.studio/view-room.html?code={code}';
};

const ROOM_SHARE_LINK_TEMPLATE = deriveShareLinkTemplate();
const buildShareUrl = (shareCode) => {
    if (!shareCode) {
        return ROOM_SHARE_LINK_TEMPLATE.replace('{code}', '');
    }
    return ROOM_SHARE_LINK_TEMPLATE.replace('{code}', encodeURIComponent(shareCode));
};
const ROOM_SHARE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const RAW_ROOM_SHARE_EXPIRY_DAYS = Number.parseInt(process.env.ROOM_SHARE_EXPIRY_DAYS, 10);
const ROOM_SHARE_EXPIRY_DAYS = Number.isFinite(RAW_ROOM_SHARE_EXPIRY_DAYS) && RAW_ROOM_SHARE_EXPIRY_DAYS > 0
    ? RAW_ROOM_SHARE_EXPIRY_DAYS
    : 30;
const RAW_ROOM_SHARE_MAX_BYTES = Number.parseInt(process.env.ROOM_SHARE_MAX_BYTES, 10);
const MAX_ROOM_SNAPSHOT_BYTES = Number.isFinite(RAW_ROOM_SHARE_MAX_BYTES) && RAW_ROOM_SHARE_MAX_BYTES > 0
    ? RAW_ROOM_SHARE_MAX_BYTES
    : 2 * 1024 * 1024;

const ROOM_SHARE_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS room_share_requests (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        share_code VARCHAR(32) NOT NULL UNIQUE,
        company_name VARCHAR(255) NULL,
        contact_name VARCHAR(255) NULL,
        contact_email VARCHAR(320) NOT NULL,
        notes TEXT NULL,
        room_name VARCHAR(255) NULL,
        user_id INT NULL,
        snapshot_json JSON NOT NULL,
        share_source VARCHAR(100) NULL,
        source_metadata JSON NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NULL,
        fulfilled_at DATETIME NULL,
        PRIMARY KEY (id),
        INDEX idx_share_code (share_code),
        INDEX idx_contact_email (contact_email),
        INDEX idx_created_at (created_at),
        INDEX idx_expires_at (expires_at),
        CONSTRAINT fk_room_share_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const ROOM_SHARE_INSERT_SQL = `
    INSERT INTO room_share_requests (
        share_code,
        company_name,
        contact_name,
        contact_email,
        notes,
        room_name,
        user_id,
        snapshot_json,
        share_source,
        source_metadata,
        expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const ROOM_SHARE_SELECT_SQL = `
    SELECT
        id,
        share_code,
        company_name,
        contact_name,
        contact_email,
        notes,
        room_name,
        user_id,
        snapshot_json,
        share_source,
        source_metadata,
        created_at,
        expires_at,
        fulfilled_at
    FROM room_share_requests
    WHERE share_code = ?
    LIMIT 1
`;

const generateShareCode = (length = 8) => {
    const safeLength = Math.max(6, Math.min(24, Number.parseInt(length, 10) || 8));
    const bytes = randomBytes(safeLength);
    let code = '';
    for (let i = 0; i < safeLength; i += 1) {
        const index = bytes[i] % SHARE_CODE_ALPHABET.length;
        code += SHARE_CODE_ALPHABET[index];
    }
    return code;
};

const formatForMySQL = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return null;
    }
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const safeParseJSONValue = (value) => {
    if (!value) {
        return null;
    }
    if (typeof value === 'object') {
        return value;
    }
    if (typeof value !== 'string') {
        return null;
    }
    try {
        return JSON.parse(value);
    } catch (error) {
        return null;
    }
};

const ensureRoomShareTable = async (connection) => {
    await connection.execute(ROOM_SHARE_TABLE_SQL);
};

const insertRoomShareRequest = async (connection, payload) => {
    const attempts = 6;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        const shareCode = generateShareCode(8 + attempt).toUpperCase();
        try {
            const [result] = await connection.execute(ROOM_SHARE_INSERT_SQL, [
                shareCode,
                payload.companyName || null,
                payload.contactName || null,
                payload.contactEmail,
                payload.notes || null,
                payload.roomName || null,
                payload.userId || null,
                payload.snapshotJSON,
                payload.shareSource || null,
                payload.metadataJSON || null,
                payload.expiresAt || null
            ]);
            return {
                shareCode,
                requestId: result.insertId || null
            };
        } catch (error) {
            if (error && error.code === 'ER_DUP_ENTRY') {
                continue;
            }
            throw error;
        }
    }
    throw new Error('Unable to allocate unique share code');
};

const sanitizeSegment = (value) => value.replace(/[^a-zA-Z0-9-_]/g, '_');

const determineExtension = (remoteUrl, defaultExt) => {
    const fallBack = defaultExt.startsWith('.') ? defaultExt : `.${defaultExt}`;
    try {
        const urlObj = new URL(remoteUrl);
        const ext = path.extname(urlObj.pathname);
        if (ext) {
            return ext;
        }
    } catch (error) {
        // Ignore parsing errors and fall back to provided extension
    }
    return fallBack;
};

const downloadAndStoreModel = async (remoteUrl, taskId, defaultExt) => {
    const extension = determineExtension(remoteUrl, defaultExt);
    const safeTaskId = sanitizeSegment(taskId);
    const filename = `${safeTaskId}${extension}`;
    const filePath = path.join(MODEL_UPLOAD_DIR, filename);

    const response = await axios.get(remoteUrl, { responseType: 'arraybuffer' });
    await fsPromises.writeFile(filePath, Buffer.from(response.data));

    return `/uploads/models/${filename}`;
};

// Middleware
app.use(cors({
    origin: [
        process.env.FRONTEND_URL || 'http://localhost:3000',
        'https://stellarion.studio',
        'http://stellarion.studio',
        'https://www.stellarion.studio',
        'http://www.stellarion.studio',
        'https://159.223.34.170',
        'http://159.223.34.170'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('.')); // Serve static files

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

// ============================================
// DATABASE API ROUTES
// ============================================
app.use('/api/users', userRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/company-registration', companyRegistrationRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api', orderRoutes);

// ============================================
// 3D MODELS DATABASE ENDPOINTS
// ============================================

/**
 * Save 3D model to database
 * POST /api/models/save
 */
app.post('/api/models/save', optionalAuth, async (req, res) => {
    let connection;
    try {
        const {
            taskId,
            name,
            description,
            category,
            price,
            modelUrl,
            previewUrl,
            imageUrl,
            downloadUrl,
            thumbnailUrl,
            originalImage,
            userId: payloadUserId,
            modelUrls
        } = req.body;

        if (!taskId || !name) {
            return res.status(400).json({
                success: false,
                message: 'Task ID and name are required'
            });
        }

        const userId = req.user?.id || payloadUserId || 1;
        const sanitizedCategory = category || 'other';
        const numericPrice = typeof price === 'number' ? price : parseFloat(price) || 0;

        connection = await getConnection();

        const resolvedModelUrls = typeof modelUrls === 'object' && modelUrls !== null ? modelUrls : {};
        const remoteGlbUrl = resolvedModelUrls.glb || modelUrl || downloadUrl || null;
        const remoteObjUrl = resolvedModelUrls.obj || null;

        const localAssetPaths = {};

        if (remoteGlbUrl) {
            try {
                localAssetPaths.glb = await downloadAndStoreModel(remoteGlbUrl, taskId, '.glb');
            } catch (error) {
                console.error('Failed to cache GLB locally:', error.message || error);
            }
        }

        if (remoteObjUrl) {
            try {
                localAssetPaths.obj = await downloadAndStoreModel(remoteObjUrl, `${taskId}-mesh`, '.obj');
            } catch (error) {
                console.error('Failed to cache OBJ locally:', error.message || error);
            }
        }

        const modelUrlsRecord = JSON.stringify({
            remote: {
                glb: remoteGlbUrl,
                obj: remoteObjUrl
            },
            proxy: resolvedModelUrls.proxy || null,
            local: localAssetPaths
        });

        const primaryModelUrl = localAssetPaths.glb || remoteGlbUrl || modelUrl || downloadUrl || null;
        const resolvedPreview = previewUrl || thumbnailUrl || resolvedModelUrls.thumbnail || null;
        const resolvedImage = imageUrl || originalImage || resolvedModelUrls.thumbnail || null;

        const insertQuery = `
            INSERT INTO 3d_models (
                user_id,
                task_id,
                name,
                description,
                category,
                price,
                model_url,
                image_url,
                preview_url,
                model_urls,
                status,
                quality_score
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)
            ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                description = VALUES(description),
                category = VALUES(category),
                price = VALUES(price),
                model_url = VALUES(model_url),
                image_url = VALUES(image_url),
                preview_url = VALUES(preview_url),
                model_urls = VALUES(model_urls),
                status = 'completed',
                updated_at = CURRENT_TIMESTAMP
        `;

        const [result] = await connection.execute(insertQuery, [
            userId,
            taskId,
            name,
            description || null,
            sanitizedCategory,
            numericPrice,
            primaryModelUrl,
            resolvedImage,
            resolvedPreview,
            modelUrlsRecord,
            0.0
        ]);

        res.json({
            success: true,
            message: 'Model saved successfully',
            modelId: result.insertId || null,
            localUrls: localAssetPaths,
            remoteUrls: {
                glb: remoteGlbUrl,
                obj: remoteObjUrl
            }
        });
    } catch (error) {
        console.error('Save model error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save model',
            error: error.message
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Store a room layout snapshot that can be shared with relocation partners
app.post('/api/room-share', optionalAuth, async (req, res) => {
    let connection;
    try {
        const body = req.body || {};
        const rawEmail = typeof body.contactEmail === 'string' ? body.contactEmail.trim() : '';
        if (!rawEmail || !ROOM_SHARE_EMAIL_REGEX.test(rawEmail)) {
            return res.status(400).json({
                success: false,
                message: 'A valid contact email is required to share the layout.'
            });
        }

        const snapshotPayload = body.snapshot;
        if (!snapshotPayload || typeof snapshotPayload !== 'object') {
            return res.status(400).json({
                success: false,
                message: 'Room snapshot payload is required.'
            });
        }

        let snapshotJSON;
        try {
            snapshotJSON = JSON.stringify(snapshotPayload);
        } catch (error) {
            console.error('Snapshot serialization failed:', error);
            return res.status(400).json({
                success: false,
                message: 'Unable to serialize room layout snapshot.'
            });
        }

        const snapshotBytes = Buffer.byteLength(snapshotJSON, 'utf8');
        if (snapshotBytes > MAX_ROOM_SNAPSHOT_BYTES) {
            return res.status(413).json({
                success: false,
                message: `Room snapshot is too large (${(snapshotBytes / (1024 * 1024)).toFixed(2)} MB). Please simplify the scene and try again.`
            });
        }

        const trimmedName = typeof body.contactName === 'string' ? body.contactName.trim() : '';
        const trimmedNotes = typeof body.notes === 'string' ? body.notes.trim() : '';
        if (trimmedNotes && trimmedNotes.length > 2000) {
            return res.status(400).json({
                success: false,
                message: 'Notes must be 2000 characters or fewer.'
            });
        }

        const trimmedRoomName = typeof body.roomName === 'string' ? body.roomName.trim() : '';
        const trimmedCompany = typeof body.companyName === 'string' ? body.companyName.trim() : 'House Relocation Company';

        const tokenUserId = req.user?.id ?? req.user?.userId ?? null;
        const payloadUserId = Number.parseInt(body.userId, 10);
        const resolvedUserId = Number.isFinite(payloadUserId)
            ? payloadUserId
            : (Number.isFinite(tokenUserId) ? tokenUserId : null);

        const shareSource = typeof body.shareSource === 'string'
            ? body.shareSource.trim().slice(0, 100)
            : 'setup-my-room';

        const metadataJSON = JSON.stringify({
            version: 1,
            savedAt: new Date().toISOString(),
            userAgent: req.get('user-agent') || null,
            ipAddress: req.ip || null,
            referer: req.get('referer') || null
        });

        const expiresAtDate = ROOM_SHARE_EXPIRY_DAYS > 0
            ? new Date(Date.now() + ROOM_SHARE_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
            : null;
        const expiresAtSql = formatForMySQL(expiresAtDate);

        connection = await getConnection();
        await ensureRoomShareTable(connection);

        const { shareCode, requestId } = await insertRoomShareRequest(connection, {
            companyName: trimmedCompany || 'House Relocation Company',
            contactName: trimmedName || null,
            contactEmail: rawEmail.toLowerCase(),
            notes: trimmedNotes || null,
            roomName: trimmedRoomName || null,
            userId: Number.isFinite(resolvedUserId) ? resolvedUserId : null,
            snapshotJSON,
            shareSource,
            metadataJSON,
            expiresAt: expiresAtSql
        });

        const shareUrl = buildShareUrl(shareCode);

        res.json({
            success: true,
            shareCode,
            shareUrl,
            requestId,
            expiresAt: expiresAtDate ? expiresAtDate.toISOString() : null
        });
    } catch (error) {
        console.error('Room share request failed:', error);
        res.status(500).json({
            success: false,
            message: 'Unable to share room layout at this time.',
            error: error.message
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Retrieve a previously shared room layout snapshot by share code
app.get('/api/room-share/:shareCode', optionalAuth, async (req, res) => {
    let connection;
    try {
        const paramsCode = typeof req.params.shareCode === 'string' ? req.params.shareCode.trim() : '';
        if (!paramsCode) {
            return res.status(404).json({
                success: false,
                message: 'Share code not provided.'
            });
        }

        const normalizedCode = paramsCode.toUpperCase();

        connection = await getConnection();
        await ensureRoomShareTable(connection);

        const [rows] = await connection.execute(ROOM_SHARE_SELECT_SQL, [normalizedCode]);
        if (!rows || rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Room share request not found.'
            });
        }

        const record = rows[0];
        const expiresAtValue = record.expires_at ? new Date(record.expires_at) : null;
        if (expiresAtValue && Number.isFinite(expiresAtValue.getTime()) && expiresAtValue.getTime() < Date.now()) {
            return res.status(410).json({
                success: false,
                message: 'This room share request has expired.'
            });
        }

        const snapshotData = safeParseJSONValue(record.snapshot_json);
        const metadata = safeParseJSONValue(record.source_metadata);

        res.json({
            success: true,
            data: {
                id: record.id,
                shareCode: record.share_code,
                companyName: record.company_name,
                contactName: record.contact_name,
                contactEmail: record.contact_email,
                notes: record.notes,
                roomName: record.room_name,
                userId: record.user_id,
                snapshot: snapshotData,
                shareSource: record.share_source,
                metadata,
                createdAt: record.created_at ? new Date(record.created_at).toISOString() : null,
                expiresAt: expiresAtValue ? expiresAtValue.toISOString() : null,
                fulfilledAt: record.fulfilled_at ? new Date(record.fulfilled_at).toISOString() : null
            }
        });
    } catch (error) {
        console.error('Fetch room share failed:', error);
        res.status(500).json({
            success: false,
            message: 'Unable to load room share request.',
            error: error.message
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

app.post('/api/company-models/save', optionalAuth, async (req, res) => {
    let connection;
    try {
        const {
            companyProfileId,
            taskId,
            name,
            description,
            category,
            style,
            price,
            wholesalePrice,
            msrp,
            sku,
            inventory,
            leadTimeDays,
            materials,
            finishes,
            modelUrl,
            previewUrl,
            imageUrl,
            downloadUrl,
            modelUrls,
            submittedByUserId
        } = req.body;

        let normalizedCompanyProfileId = Number.parseInt(companyProfileId, 10);

        const tokenCompanyId = req.user?.companyId;
        if (!Number.isFinite(normalizedCompanyProfileId) && Number.isFinite(tokenCompanyId)) {
            normalizedCompanyProfileId = tokenCompanyId;
        }

        const resolvedSubmittedBy = req.user?.userId || submittedByUserId || null;

        if (!Number.isFinite(normalizedCompanyProfileId) || normalizedCompanyProfileId <= 0) {
            if (Number.isFinite(tokenCompanyId) && tokenCompanyId > 0) {
                normalizedCompanyProfileId = tokenCompanyId;
            }
        }

        if (!Number.isFinite(normalizedCompanyProfileId) || normalizedCompanyProfileId <= 0) {
            if (!resolvedSubmittedBy) {
                return res.status(400).json({
                    success: false,
                    message: 'A company profile ID or authenticated user is required.'
                });
            }

            let lookupConnection;
            try {
                lookupConnection = await getConnection();
                const profileQuery = `
                    SELECT id
                    FROM company_profiles
                    WHERE user_id = ?
                    ORDER BY id ASC
                    LIMIT 1
                `;
                const [rows] = await lookupConnection.execute(profileQuery, [resolvedSubmittedBy]);
                if (rows.length > 0) {
                    normalizedCompanyProfileId = rows[0].id;
                }
            } catch (error) {
                console.error('Failed to resolve company profile for user', resolvedSubmittedBy, error);
            } finally {
                if (lookupConnection) {
                    lookupConnection.release();
                }
            }

            if (!Number.isFinite(normalizedCompanyProfileId) || normalizedCompanyProfileId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No company profile linked to this account yet.'
                });
            }
        }

        const sanitizedCategory = category || 'other';
        const sanitizedStyle = style || 'modern';
        const numericPrice = price !== undefined && price !== null ? Number.parseFloat(price) : null;
        const numericWholesale = wholesalePrice !== undefined && wholesalePrice !== null ? Number.parseFloat(wholesalePrice) : null;
        const numericMsrp = msrp !== undefined && msrp !== null ? Number.parseFloat(msrp) : null;
        const numericInventory = inventory !== undefined && inventory !== null ? Number.parseInt(inventory, 10) : null;
        const numericLeadTime = leadTimeDays !== undefined && leadTimeDays !== null ? Number.parseInt(leadTimeDays, 10) : null;
        connection = await getConnection();

        const resolvedModelUrls = typeof modelUrls === 'object' && modelUrls !== null ? modelUrls : {};
        const remoteGlbUrl = resolvedModelUrls.glb || modelUrl || downloadUrl || null;
        const remoteObjUrl = resolvedModelUrls.obj || null;

        const localAssetPaths = {};

        if (remoteGlbUrl) {
            try {
                localAssetPaths.glb = await downloadAndStoreModel(remoteGlbUrl, taskId, '.glb');
            } catch (error) {
                console.error('Failed to cache company GLB locally:', error.message || error);
            }
        }

        if (remoteObjUrl) {
            try {
                localAssetPaths.obj = await downloadAndStoreModel(remoteObjUrl, `${taskId}-company-mesh`, '.obj');
            } catch (error) {
                console.error('Failed to cache company OBJ locally:', error.message || error);
            }
        }

        const modelUrlsRecord = JSON.stringify({
            remote: {
                glb: remoteGlbUrl,
                obj: remoteObjUrl
            },
            proxy: resolvedModelUrls.proxy || null,
            local: localAssetPaths,
            thumbnail: resolvedModelUrls.thumbnail || previewUrl || null
        });

        const primaryModelUrl = localAssetPaths.glb || remoteGlbUrl || null;
        const resolvedPreview = previewUrl || resolvedModelUrls.thumbnail || null;
        const resolvedImage = imageUrl || resolvedModelUrls.thumbnail || null;

        const insertQuery = `
            INSERT INTO 3d_models_company (
                company_profile_id,
                submitted_by_user_id,
                task_id,
                name,
                description,
                category,
                style,
                price,
                wholesale_price,
                msrp,
                sku,
                inventory,
                lead_time_days,
                materials,
                finishes,
                model_url,
                preview_url,
                image_url,
                model_urls,
                status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
            ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                description = VALUES(description),
                category = VALUES(category),
                style = VALUES(style),
                price = VALUES(price),
                wholesale_price = VALUES(wholesale_price),
                msrp = VALUES(msrp),
                sku = VALUES(sku),
                inventory = VALUES(inventory),
                lead_time_days = VALUES(lead_time_days),
                materials = VALUES(materials),
                finishes = VALUES(finishes),
                model_url = VALUES(model_url),
                preview_url = VALUES(preview_url),
                image_url = VALUES(image_url),
                model_urls = VALUES(model_urls),
                status = 'draft',
                updated_at = CURRENT_TIMESTAMP
        `;

        const [result] = await connection.execute(insertQuery, [
            normalizedCompanyProfileId,
            resolvedSubmittedBy,
            taskId,
            name,
            description || null,
            sanitizedCategory,
            sanitizedStyle,
            numericPrice,
            numericWholesale,
            numericMsrp,
            sku || null,
            numericInventory,
            numericLeadTime,
            materials || null,
            finishes || null,
            primaryModelUrl,
            resolvedPreview,
            resolvedImage,
            modelUrlsRecord
        ]);

        res.json({
            success: true,
            message: 'Company model saved successfully',
            modelId: result.insertId || null,
            localUrls: localAssetPaths,
            remoteUrls: {
                glb: remoteGlbUrl,
                obj: remoteObjUrl
            }
        });
    } catch (error) {
        console.error('Save company model error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save company model',
            error: error.message
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

app.get('/api/company-models', optionalAuth, async (req, res) => {
    let connection;
    try {
        const { companyProfileId, status } = req.query;

        let normalizedCompanyProfileId = Number.parseInt(companyProfileId, 10);
        const tokenCompanyId = Number.isFinite(req.user?.companyId) ? req.user.companyId : null;

        if (!Number.isFinite(normalizedCompanyProfileId) || normalizedCompanyProfileId <= 0) {
            if (Number.isFinite(tokenCompanyId) && tokenCompanyId > 0) {
                normalizedCompanyProfileId = tokenCompanyId;
            }
        }

        if (!Number.isFinite(normalizedCompanyProfileId) || normalizedCompanyProfileId <= 0) {
            const resolvedSubmittedBy = req.user?.userId;

            if (resolvedSubmittedBy) {
                let lookupConnection;
                try {
                    lookupConnection = await getConnection();
                    const profileQuery = `
                        SELECT id
                        FROM company_profiles
                        WHERE user_id = ?
                        ORDER BY id ASC
                        LIMIT 1
                    `;
                    const [rows] = await lookupConnection.execute(profileQuery, [resolvedSubmittedBy]);
                    if (rows.length > 0) {
                        normalizedCompanyProfileId = rows[0].id;
                    }
                } catch (error) {
                    console.error('Failed to resolve company profile for user', resolvedSubmittedBy, error);
                } finally {
                    if (lookupConnection) {
                        lookupConnection.release();
                    }
                }
            }
        }

        connection = await getConnection();
        const filters = [];
        const params = [];

        let selectQuery = `
            SELECT
                id,
                company_profile_id,
                submitted_by_user_id,
                task_id,
                name,
                description,
                category,
                style,
                price,
                wholesale_price,
                msrp,
                sku,
                inventory,
                lead_time_days,
                materials,
                finishes,
                model_url,
                preview_url,
                image_url,
                model_urls,
                status,
                created_at,
                updated_at
            FROM 3d_models_company
        `;

        const usingCompanyFilter = Number.isFinite(normalizedCompanyProfileId) && normalizedCompanyProfileId > 0;
        if (usingCompanyFilter) {
            filters.push('company_profile_id = ?');
            params.push(normalizedCompanyProfileId);
        }

        if (status) {
            filters.push('status = ?');
            params.push(status);
        }

        if (filters.length > 0) {
            selectQuery += ` WHERE ${filters.join(' AND ')}`;
        }

        selectQuery += ' ORDER BY created_at DESC';

        const [rows] = await connection.execute(selectQuery, params);
        const models = rows.map(mapCompanyModelRow).filter(Boolean);

        res.json({
            success: true,
            companyProfileId: usingCompanyFilter ? normalizedCompanyProfileId : null,
            scope: usingCompanyFilter ? 'company' : 'all',
            count: models.length,
            models
        });
    } catch (error) {
        console.error('Fetch company models error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch company models',
            error: error.message
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

app.get('/api/company-models/:id', optionalAuth, async (req, res) => {
    let connection;
    try {
        const rawId = req.params.id;
        const numericId = Number.parseInt(rawId, 10);
        if (!Number.isFinite(numericId) || numericId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid asset id'
            });
        }

        connection = await getConnection();
        const record = await fetchCompanyModelById(connection, numericId);

        if (!record) {
            return res.status(404).json({
                success: false,
                message: 'Company asset not found'
            });
        }

        const model = mapCompanyModelRow(record);
        res.json({
            success: true,
            model
        });
    } catch (error) {
        console.error('Fetch company model by id error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch company model',
            error: error.message
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

app.put('/api/company-models/:id', optionalAuth, async (req, res) => {
    try {
        const numericId = Number.parseInt(req.params.id, 10);
        if (!Number.isFinite(numericId) || numericId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid asset id'
            });
        }

        const { model, notFound } = await applyCompanyModelUpdate(numericId, req.body || {});
        if (notFound) {
            return res.status(404).json({
                success: false,
                message: 'Company asset not found'
            });
        }

        res.json({
            success: true,
            model
        });
    } catch (error) {
        console.error('Update company model error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update company model',
            error: error.message
        });
    }
});

app.patch('/api/company-models/:id', optionalAuth, async (req, res) => {
    try {
        const numericId = Number.parseInt(req.params.id, 10);
        if (!Number.isFinite(numericId) || numericId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid asset id'
            });
        }

        const { model, notFound } = await applyCompanyModelUpdate(numericId, req.body || {});
        if (notFound) {
            return res.status(404).json({
                success: false,
                message: 'Company asset not found'
            });
        }

        res.json({
            success: true,
            model
        });
    } catch (error) {
        console.error('Patch company model error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to modify company model',
            error: error.message
        });
    }
});

app.post('/api/company-models/:id/duplicate', optionalAuth, async (req, res) => {
    let connection;
    try {
        const numericId = Number.parseInt(req.params.id, 10);
        if (!Number.isFinite(numericId) || numericId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid asset id'
            });
        }

        connection = await getConnection();
        const original = await fetchCompanyModelById(connection, numericId);
        if (!original) {
            return res.status(404).json({
                success: false,
                message: 'Company asset not found'
            });
        }

        const originalUrls = parseCompanyModelUrls(original.model_urls);
        const duplicatedName = original.name ? `${original.name} Copy` : 'Asset Copy';
        let duplicateTaskId = sanitizeSegment(
            `${original.task_id || 'company-model'}-${randomUUID().slice(0, 8)}`
        ).slice(-120);
        if (!duplicateTaskId) {
            duplicateTaskId = `company-model-${randomUUID().slice(0, 8)}`;
        }

        const insertQuery = `
            INSERT INTO 3d_models_company (
                company_profile_id,
                submitted_by_user_id,
                task_id,
                name,
                description,
                category,
                style,
                price,
                wholesale_price,
                msrp,
                sku,
                inventory,
                lead_time_days,
                materials,
                finishes,
                model_url,
                preview_url,
                image_url,
                model_urls,
                status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
        `;

        const insertParams = [
            original.company_profile_id,
            original.submitted_by_user_id,
            duplicateTaskId,
            duplicatedName,
            original.description,
            original.category,
            original.style,
            original.price,
            original.wholesale_price,
            original.msrp,
            original.sku,
            original.inventory,
            original.lead_time_days,
            original.materials,
            original.finishes,
            original.model_url,
            original.preview_url,
            original.image_url,
            JSON.stringify(originalUrls)
        ];

        const [result] = await connection.execute(insertQuery, insertParams);
        const newId = result.insertId;
        const duplicatedRecord = await fetchCompanyModelById(connection, newId);

        res.json({
            success: true,
            message: 'Asset duplicated successfully',
            model: mapCompanyModelRow(duplicatedRecord)
        });
    } catch (error) {
        console.error('Duplicate company model error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to duplicate company asset',
            error: error.message
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

app.delete('/api/company-models/:id', optionalAuth, async (req, res) => {
    let connection;
    try {
        const numericId = Number.parseInt(req.params.id, 10);
        if (!Number.isFinite(numericId) || numericId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid asset id'
            });
        }

        connection = await getConnection();
        const updateQuery = `
            UPDATE 3d_models_company
            SET status = 'archived', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;
        const [result] = await connection.execute(updateQuery, [numericId]);
        if (!result.affectedRows) {
            return res.status(404).json({
                success: false,
                message: 'Company asset not found'
            });
        }

        res.json({
            success: true,
            message: 'Company asset archived'
        });
    } catch (error) {
        console.error('Archive company model error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to archive company asset',
            error: error.message
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

/**
 * Get user's 3D models
 * GET /api/models/my-models
 */
app.get('/api/models/my-models', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        const userId = 1; // For now, using default user ID

        const connection = await getConnection();
        const query = `
            SELECT 
                id, name, thumbnail_url, download_url, status, created_at,
                (SELECT COUNT(*) FROM model_likes WHERE model_id = 3d_models.id) as likes_count,
                (SELECT COUNT(*) FROM model_downloads WHERE model_id = 3d_models.id) as downloads_count
            FROM 3d_models 
            WHERE user_id = ? 
            ORDER BY created_at DESC
        `;
        
        const [models] = await connection.execute(query, [userId]);

        res.json({
            success: true,
            models: models
        });
    } catch (error) {
        console.error('Get models error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get models',
            error: error.message
        });
    }
});

/**
 * Get public model gallery
 * GET /api/models/gallery
 */
app.get('/api/models/gallery', async (req, res) => {
    let connection;
    try {
        connection = await getConnection();
        const query = `
            SELECT * FROM model_gallery
            LIMIT 50
        `;
        
        const [models] = await connection.execute(query);

        res.json({
            success: true,
            models: models
        });
    } catch (error) {
        console.error('Get gallery error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get gallery',
            error: error.message
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

const mapModelRecord = (row) => {
    let parsedUrls = null;
    if (row.model_urls) {
        try {
            parsedUrls = JSON.parse(row.model_urls);
        } catch (error) {
            console.warn('Failed to parse model_urls JSON for model', row.id, error.message);
        }
    }

    const localGlb = parsedUrls?.local?.glb || null;
    const localObj = parsedUrls?.local?.obj || null;
    const proxyGlb = parsedUrls?.proxy || null;
    const remoteGlb = parsedUrls?.remote?.glb || null;
    const remoteObj = parsedUrls?.remote?.obj || null;

    const resolvedDownload = localGlb || remoteGlb || row.model_url || null;
    const resolvedThumb = row.preview_url || parsedUrls?.thumbnail || row.image_url || null;

    return {
        id: row.id,
        name: row.name,
        description: row.description,
        category: row.category,
        style: row.style,
        price: row.price,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        thumbnail_url: resolvedThumb,
        download_url: resolvedDownload,
        local_urls: {
            glb: localGlb,
            obj: localObj
        },
        remote_urls: {
            glb: remoteGlb,
            obj: remoteObj
        },
        proxy_url: proxyGlb
    };
};

const safeParseJson = (value, fallback = {}) => {
    if (value === null || value === undefined || value === '') {
        return Array.isArray(fallback) ? [...fallback] : { ...fallback };
    }
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch (error) {
            return Array.isArray(fallback) ? [...fallback] : { ...fallback };
        }
    }
    if (typeof value === 'object') {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            return { ...value };
        }
    }
    return Array.isArray(fallback) ? [...fallback] : { ...fallback };
};

const deepMergeObjects = (target, source) => {
    const base = Array.isArray(target) ? [...target] : { ...target };
    if (!source || typeof source !== 'object') {
        return base;
    }

    Object.keys(source).forEach((key) => {
        const value = source[key];
        if (value === undefined) {
            return;
        }
        if (value === null) {
            base[key] = null;
            return;
        }
        if (Array.isArray(value)) {
            base[key] = [...value];
            return;
        }
        if (typeof value === 'object') {
            const existing = base[key];
            base[key] = deepMergeObjects(
                typeof existing === 'object' && existing !== null ? existing : {},
                value
            );
            return;
        }
        base[key] = value;
    });

    return base;
};

const normalizeCompanyTags = (value) => {
    if (Array.isArray(value)) {
        return value.map((tag) => (tag ?? '').toString().trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean);
    }
    return [];
};

const resolveMetaHeightValue = (value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const numeric = Number.parseFloat(value);
    return Number.isFinite(numeric) ? numeric : null;
};

const parseCompanyModelUrls = (value) => {
    const parsed = safeParseJson(value, {});
    return parsed && typeof parsed === 'object' ? parsed : {};
};

const mergeCompanyModelUrls = (existingUrls, incomingUrls, { thumbnail, metaHeight, tags } = {}) => {
    const base = deepMergeObjects({}, parseCompanyModelUrls(existingUrls));
    const incoming = incomingUrls !== undefined ? parseCompanyModelUrls(incomingUrls) : null;
    const merged = incoming ? deepMergeObjects(base, incoming) : base;

    if (thumbnail !== undefined) {
        merged.thumbnail = thumbnail || null;
    }

    if (metaHeight !== undefined) {
        const numeric = resolveMetaHeightValue(metaHeight);
        if (numeric === null) {
            if (merged.meta && typeof merged.meta === 'object') {
                delete merged.meta.height_offset;
            }
        } else {
            const meta = merged.meta && typeof merged.meta === 'object' ? merged.meta : {};
            meta.height_offset = numeric;
            merged.meta = meta;
        }
    }

    if (tags !== undefined) {
        const meta = merged.meta && typeof merged.meta === 'object' ? merged.meta : {};
        meta.tags = tags;
        merged.meta = meta;
        merged.tags = tags;
    }

    if (merged.meta && Object.keys(merged.meta).length === 0) {
        delete merged.meta;
    }

    return merged;
};

const mapCompanyModelRow = (row) => {
    if (!row || typeof row !== 'object') {
        return null;
    }

    const parsedUrls = parseCompanyModelUrls(row.model_urls);
    const meta = parsedUrls && typeof parsedUrls.meta === 'object' ? parsedUrls.meta : {};
    const tagsFromMeta = normalizeCompanyTags(meta?.tags || parsedUrls?.tags || row.tags);
    const metaHeightSource = meta?.height_offset ?? meta?.meta_height_offset ?? row.meta_height_offset;
    const normalizedHeight = resolveMetaHeightValue(metaHeightSource);

    const thumbnail = row.preview_url || parsedUrls.thumbnail || row.image_url || null;
    const glbUrl = parsedUrls.glb || parsedUrls.gltf || parsedUrls.remote?.glb || parsedUrls.local?.glb || row.model_url || null;
    const usdzUrl = parsedUrls.usdz || parsedUrls.remote?.usdz || null;

    return {
        ...row,
        price: row.price !== null && row.price !== undefined ? Number(row.price) : null,
        wholesale_price: row.wholesale_price !== null && row.wholesale_price !== undefined ? Number(row.wholesale_price) : null,
        msrp: row.msrp !== null && row.msrp !== undefined ? Number(row.msrp) : null,
        inventory: row.inventory !== null && row.inventory !== undefined ? Number(row.inventory) : null,
        lead_time_days: row.lead_time_days !== null && row.lead_time_days !== undefined ? Number(row.lead_time_days) : null,
        model_urls_raw: row.model_urls,
        model_urls: parsedUrls,
        tags: tagsFromMeta,
        thumbnail_url: thumbnail,
        glb_url: glbUrl,
        usdz_url: usdzUrl,
        active: (row.status || '').toLowerCase() === 'published',
        status_normalized: (row.status || '').toLowerCase(),
        meta_height_offset: normalizedHeight,
        updated_at: row.updated_at,
        created_at: row.created_at
    };
};

const fetchCompanyModelById = async (connection, id) => {
    const query = `
        SELECT
            id,
            company_profile_id,
            submitted_by_user_id,
            task_id,
            name,
            description,
            category,
            style,
            price,
            wholesale_price,
            msrp,
            sku,
            inventory,
            lead_time_days,
            materials,
            finishes,
            model_url,
            preview_url,
            image_url,
            model_urls,
            status,
            created_at,
            updated_at
        FROM 3d_models_company
        WHERE id = ?
        LIMIT 1
    `;

    const [rows] = await connection.execute(query, [id]);
    return rows && rows.length > 0 ? rows[0] : null;
};

const toNullableFloat = (value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const numeric = Number.parseFloat(value);
    return Number.isFinite(numeric) ? numeric : null;
};

const applyCompanyModelUpdate = async (id, updates = {}) => {
    let connection;
    try {
        connection = await getConnection();
        const existing = await fetchCompanyModelById(connection, id);
        if (!existing) {
            return { notFound: true };
        }

        const existingUrls = parseCompanyModelUrls(existing.model_urls);
        const has = (key) => Object.prototype.hasOwnProperty.call(updates, key);

        const tagsUpdate = has('tags') ? normalizeCompanyTags(updates.tags) : undefined;
        const metaHeightUpdate = has('meta_height_offset') ? resolveMetaHeightValue(updates.meta_height_offset) : undefined;
        const urlsUpdate = has('model_urls') ? updates.model_urls : undefined;
        const activeFlag = has('active')
            ? (typeof updates.active === 'string'
                ? ['true', '1', 'yes', 'on'].includes(updates.active.toLowerCase())
                : Boolean(updates.active))
            : undefined;

        const mergedUrls = mergeCompanyModelUrls(existingUrls, urlsUpdate, {
            thumbnail: has('thumbnail_url') ? updates.thumbnail_url : undefined,
            metaHeight: metaHeightUpdate,
            tags: tagsUpdate
        });

        const resolvedPreview = has('thumbnail_url')
            ? updates.thumbnail_url || null
            : (mergedUrls.thumbnail !== undefined ? mergedUrls.thumbnail : existing.preview_url);

        const resolvedImage = has('thumbnail_url')
            ? updates.thumbnail_url || null
            : (mergedUrls.thumbnail !== undefined ? mergedUrls.thumbnail : existing.image_url);

        if ((mergedUrls.thumbnail === undefined || mergedUrls.thumbnail === null) && resolvedPreview) {
            mergedUrls.thumbnail = resolvedPreview;
        }

        const resolvedName = has('name') ? updates.name : existing.name;
        const resolvedDescription = has('description') ? updates.description : existing.description;
        const resolvedCategory = has('category') ? updates.category : existing.category;
        const resolvedStyle = has('style') ? updates.style : existing.style;
        const resolvedPrice = has('price') ? toNullableFloat(updates.price) : existing.price;

        const resolvedStatus = activeFlag !== undefined
            ? (activeFlag ? 'published' : 'archived')
            : (has('status') ? updates.status : existing.status);
        const statusValue = typeof resolvedStatus === 'string' ? resolvedStatus.toLowerCase() : resolvedStatus;

        const resolvedModelUrl = mergedUrls.glb
            || mergedUrls.gltf
            || mergedUrls.remote?.glb
            || mergedUrls.local?.glb
            || existing.model_url
            || null;

        const updateQuery = `
            UPDATE 3d_models_company
            SET name = ?,
                description = ?,
                category = ?,
                style = ?,
                price = ?,
                preview_url = ?,
                image_url = ?,
                model_url = ?,
                model_urls = ?,
                status = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;

        await connection.execute(updateQuery, [
            resolvedName,
            resolvedDescription,
            resolvedCategory,
            resolvedStyle,
            resolvedPrice,
            resolvedPreview,
            resolvedImage,
            resolvedModelUrl,
            JSON.stringify(mergedUrls),
            statusValue,
            id
        ]);

        const updated = await fetchCompanyModelById(connection, id);
        return {
            model: mapCompanyModelRow(updated)
        };
    } catch (error) {
        throw error;
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

app.get('/api/models/all', async (req, res) => {
    let connection;
    try {
        connection = await getConnection();
        const query = `
            SELECT id, name, description, category, style, price, status,
                   preview_url, image_url, model_url, model_urls,
                   created_at, updated_at
            FROM 3d_models
            ORDER BY created_at DESC
            LIMIT 200
        `;

        const [rows] = await connection.execute(query);
        const models = rows.map(mapModelRecord);

        res.json({
            success: true,
            models
        });
    } catch (error) {
        console.error('Get all models error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve models',
            error: error.message
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

/**
 * Get 3D models for a specific user
 * GET /api/models/user/:userId
 */
app.get('/api/models/user/:userId', async (req, res) => {
    let connection;
    try {
        const userIdParam = req.params.userId;
        const userId = Number.parseInt(userIdParam, 10);

        if (!Number.isFinite(userId) || userId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'A valid numeric userId is required.'
            });
        }

        connection = await getConnection();
        const query = `
            SELECT id, name, description, category, style, price, status,
                   preview_url, image_url, model_url, model_urls,
                   created_at, updated_at
            FROM 3d_models
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 200
        `;

        const [rows] = await connection.execute(query, [userId]);
        const models = rows.map(mapModelRecord);

        res.json({
            success: true,
            userId,
            count: models.length,
            models
        });
    } catch (error) {
        console.error('Get user models error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve models for user',
            error: error.message
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

/**
 * Delete 3D model
 * DELETE /api/models/:id
 */
app.delete('/api/models/:id', async (req, res) => {
    try {
        const modelId = req.params.id;
        const token = req.headers.authorization?.replace('Bearer ', '');
        const userId = 1; // For now, using default user ID

        const connection = await getConnection();
        const query = 'DELETE FROM 3d_models WHERE id = ? AND user_id = ?';
        
        const [result] = await connection.execute(query, [modelId, userId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Model not found or not authorized'
            });
        }

        res.json({
            success: true,
            message: 'Model deleted successfully'
        });
    } catch (error) {
        console.error('Delete model error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete model',
            error: error.message
        });
    }
});

// ============================================
// MESHY API ENDPOINTS
// ============================================

/**
 * Upload image and create 3D model task
 * POST /api/create-3d-model
 * Body: FormData with image file and name
 */
app.post('/api/create-3d-model', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No image file provided'
            });
        }

        const { name, details } = req.body;
        if (!name) {
            return res.status(400).json({
                success: false,
                error: 'Model name is required'
            });
        }

        // Parse model details if provided
        let modelDetails = {};
        if (details) {
            try {
                modelDetails = JSON.parse(details);
            } catch (e) {
                console.warn('Invalid details JSON, using empty object');
            }
        }

        console.log('Creating 3D model for:', name);
        console.log('Model details:', modelDetails);
        console.log('File size:', req.file.size, 'bytes');
        console.log('File type:', req.file.mimetype);

        // Convert image buffer to base64 data URL
        const imageBase64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

        console.log('Sending request to Meshy API...');

        // Create image-to-3D task with base64 image
        const response = await axios.post(
            MESHY_API_BASE,
            {
                image_url: imageBase64,
                enable_pbr: true,
                ai_model: 'meshy-4',
                topology: 'quad',
                target_polycount: 30000
            },
            {
                headers: {
                    'Authorization': `Bearer ${MESHY_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('3D Task created:', response.data);

        res.json({
            success: true,
            taskId: response.data.result,
            message: '3D model generation started',
            details: modelDetails
        });

    } catch (error) {
        console.error('Error creating 3D model:', error.response?.data || error.message);
        
        let errorMessage = error.message;
        if (error.response?.data) {
            errorMessage = typeof error.response.data === 'string' 
                ? error.response.data 
                : error.response.data.message || JSON.stringify(error.response.data);
        }
        
        res.status(error.response?.status || 500).json({
            success: false,
            error: errorMessage,
            details: error.response?.data
        });
    }
});

/**
 * Check 3D model generation status
 * GET /api/check-status/:id
 */
app.get('/api/check-status/:id', optionalAuth, async (req, res) => {
    try {
        const taskId = req.params.id; // Use req.params.id instead of destructuring

        console.log('Checking status for task:', taskId);

        const response = await axios.get(
            `${MESHY_API_BASE}/${taskId}`,
            {
                headers: {
                    'Authorization': `Bearer ${MESHY_API_KEY}`
                }
            }
        );

        console.log('Meshy API response status:', response.data.status);

        res.json({
            success: true,
            status: response.data.status,
            progress: response.data.progress,
            modelUrl: response.data.model_urls?.glb,
            thumbnailUrl: response.data.thumbnail_url,
            data: response.data
        });

    } catch (error) {
        console.error('Error checking 3D status:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data || error.message
        });
    }
});

/**
 * Proxy GLB file for viewing (CORS-enabled)
 * GET /api/proxy-glb/:taskId
 */
app.get('/api/proxy-glb/:taskId', optionalAuth, async (req, res) => {
    try {
        const { taskId } = req.params;

        // Get task details
        const taskResponse = await axios.get(
            `${MESHY_API_BASE}/${taskId}`,
            {
                headers: {
                    'Authorization': `Bearer ${MESHY_API_KEY}`
                }
            }
        );

        const glbUrl = taskResponse.data.model_urls?.glb;

        if (!glbUrl) {
            return res.status(404).json({
                success: false,
                error: 'Model not ready yet'
            });
        }

        // Download the GLB file
        const fileResponse = await axios.get(glbUrl, {
            responseType: 'arraybuffer'
        });

        // Set proper CORS headers for viewing
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Content-Type', 'model/gltf-binary');
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
        
        res.send(fileResponse.data);

    } catch (error) {
        console.error('Error proxying GLB model:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data || error.message
        });
    }
});

/**
 * Generic proxy for Meshy-hosted assets (GLB/OBJ/Textures) with CORS headers
 * GET /api/proxy-model?url={encodedMeshyUrl}
 */
app.get('/api/proxy-model', optionalAuth, async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ success: false, message: 'Missing url parameter' });
    }

    try {
        const parsedUrl = new URL(url);
        if (!ALLOWED_PROXY_HOSTS.has(parsedUrl.hostname)) {
            return res.status(400).json({ success: false, message: 'Host not permitted' });
        }

        const fileResponse = await axios.get(parsedUrl.toString(), {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'StellarionProxy/1.0',
                'Accept': 'application/octet-stream'
            }
        });

        const contentType = fileResponse.headers['content-type'] || 'application/octet-stream';

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=3600');

        res.send(fileResponse.data);
    } catch (error) {
        const status = error.response?.status || 500;
        console.error('Proxy model error:', error.response?.data || error.message);
        res.status(status).json({
            success: false,
            message: 'Failed to proxy model asset',
            error: error.response?.data || error.message
        });
    }
});

/**
 * Download 3D model GLB file
 * GET /api/download/:taskId
 */
app.get('/api/download/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        const directUrl = req.query.url;

        let glbUrl = directUrl;

        if (!glbUrl) {
            const taskResponse = await axios.get(
                `${MESHY_API_BASE}/${taskId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${MESHY_API_KEY}`
                    }
                }
            );

            glbUrl = taskResponse.data.model_urls?.glb;
        }

        if (!glbUrl) {
            return res.status(404).json({
                success: false,
                error: 'Model not ready yet'
            });
        }

        const fileResponse = await axios.get(glbUrl, {
            responseType: 'arraybuffer'
        });

        const extension = determineExtension(glbUrl, '.glb');
        const downloadName = `model-${sanitizeSegment(taskId)}${extension}`;

        res.setHeader('Content-Type', 'model/gltf-binary');
        res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
        res.send(fileResponse.data);

    } catch (error) {
        console.error('Error downloading model:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data || error.message
        });
    }
});

// ============================================
// AI SAFETY & LAYOUT ANALYSIS ENDPOINT
// ============================================

const assetNameMatches = (name = '', keywords = []) => {
    const normalized = name.toString().toLowerCase();
    return keywords.some(keyword => normalized.includes(keyword));
};

const evaluateLayoutHazards = (snapshot = {}) => {
    const assets = Array.isArray(snapshot.assets) ? snapshot.assets : [];
    if (assets.length === 0) {
        return {
            summary: 'No assets supplied for safety analysis.',
            issues: [],
            recommendations: []
        };
    }

    const sofas = assets.filter(asset => assetNameMatches(asset.name, ['sofa', 'couch', 'sectional']));
    const shelves = assets.filter(asset => assetNameMatches(asset.name, ['shelf', 'bookcase', 'book shelf']));

    const issues = [];
    const recommendations = [];

    const boxesOverlap = (boxA, boxB, margin = 0.2) => {
        if (!boxA || !boxB || !boxA.min || !boxA.max || !boxB.min || !boxB.max) return false;
        return !(
            boxA.max[0] + margin < boxB.min[0] - margin ||
            boxA.min[0] - margin > boxB.max[0] + margin ||
            boxA.max[2] + margin < boxB.min[2] - margin ||
            boxA.min[2] - margin > boxB.max[2] + margin
        );
    };

    const getTop = asset => {
        const box = asset.boundingBox;
        if (box?.max) return box.max[1];
        return (asset.position?.[1] || 0) + ((asset.scale?.[1] || 1) / 2);
    };

    const getBottom = asset => {
        const box = asset.boundingBox;
        if (box?.min) return box.min[1];
        return asset.position?.[1] || 0;
    };

    sofas.forEach(sofa => {
        shelves.forEach(shelf => {
            const [sx, sy, sz] = sofa.position || [0, 0, 0];
            const [bx, by, bz] = shelf.position || [0, 0, 0];
            const horizontalDistance = Math.hypot((bx || 0) - (sx || 0), (bz || 0) - (sz || 0));
            const sofaBox = sofa.boundingBox || null;
            const shelfBox = shelf.boundingBox || null;
            const aligned = boxesOverlap(sofaBox, shelfBox) || horizontalDistance < 1.6;
            const clearance = getBottom(shelf) - getTop(sofa);
            const verticalDifference = Math.abs((by || 0) - (sy || 0));

            if (aligned && clearance > 0 && clearance < 3.25) {
                issues.push({
                    title: 'Shelf above seating zone',
                    detail: `${shelf.name} sits above ${sofa.name}. Anchor the shelf or relocate to reduce fall risk during earthquakes.`
                });
                recommendations.push({
                    action: 'Anchor shelf or move laterally',
                    benefit: 'Prevents injuries from falling shelves during tremors or collisions.'
                });
            }

            if (aligned && verticalDifference >= 5) {
                issues.push({
                    title: 'Tall fixture above seating zone',
                    detail: `${shelf.name} is positioned far above ${sofa.name}. Secure it heavily or reposition to reduce severe fall risks.`
                });
                recommendations.push({
                    action: 'Lower or reinforce the high shelf',
                    benefit: 'Reduces impact severity if the fixture fails or tips from height.'
                });
            }
        });
    });

    return {
        summary: issues.length > 0
            ? 'Local heuristics flagged potential hazards.'
            : 'Local heuristics did not detect significant hazards.',
        issues,
        recommendations
    };
};

const mergeAnalysisResults = (primary, secondary) => {
    if (!primary && !secondary) return null;
    if (!primary) return secondary;
    if (!secondary) return primary;

    const summaryParts = [primary.summary, secondary.summary].filter(Boolean);
    const uniqueSummaries = Array.from(new Set(summaryParts));
    return {
        summary: uniqueSummaries.join(' | '),
        issues: [...(primary.issues || []), ...(secondary.issues || [])],
        recommendations: [...(primary.recommendations || []), ...(secondary.recommendations || [])]
    };
};

const GEMINI_COOLDOWN_MS = Number.parseInt(process.env.GEMINI_COOLDOWN_MS || '4000', 10);
let lastGeminiCall = 0;

const extractGeminiKey = (headers) => {
    const explicitKey = headers['x-api-key'];
    if (typeof explicitKey === 'string' && explicitKey.trim()) {
        return explicitKey.trim();
    }

    return process.env.GEMINI_API_KEY || null;
};

app.post('/api/ai/layout-check', async (req, res) => {
    const snapshot = req.body || {};
    const localResult = evaluateLayoutHazards(snapshot);

    try {
        const geminiKey = extractGeminiKey(req.headers);
        if (!geminiKey) {
            return res.json({
                summary: `${localResult.summary} | Gemini analysis skipped (API key not provided).`,
                issues: localResult.issues,
                recommendations: localResult.recommendations
            });
        }

        const now = Date.now();
        const timeSinceLast = now - lastGeminiCall;
        if (timeSinceLast < GEMINI_COOLDOWN_MS) {
            const waitMs = GEMINI_COOLDOWN_MS - timeSinceLast;
            const cooldownResult = mergeAnalysisResults(localResult, {
                summary: `Gemini throttled. Try again in ${Math.ceil(waitMs / 1000)}s.`,
                issues: [],
                recommendations: []
            });
            return res.json(cooldownResult || localResult);
        }

        const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
        const prompt = `You are a safety consultant specializing in interior layouts. Analyze the following JSON describing a room and its assets. Identify safety risks (like objects placed above seating) considering earthquakes or tipping risks. Respond strictly in JSON with keys: summary (string), issues (array of {title, detail}), recommendations (array of {action, benefit}). JSON data:\n${JSON.stringify(snapshot, null, 2)}`;

        try {
            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
                {
                    contents: [
                        {
                            role: 'user',
                            parts: [{ text: prompt }]
                        }
                    ]
                },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            lastGeminiCall = Date.now();

            const candidates = response.data?.candidates || [];
            const modelText = candidates
                .flatMap(candidate => candidate.content?.parts || [])
                .map(part => part.text)
                .filter(Boolean)
                .join('\n');

            let remoteResult = null;
            if (modelText) {
                try {
                    remoteResult = JSON.parse(modelText);
                } catch (error) {
                    remoteResult = {
                        summary: 'Gemini returned unstructured text. See details field.',
                        issues: [],
                        recommendations: [],
                        details: modelText
                    };
                }
            }

            const merged = mergeAnalysisResults(localResult, remoteResult);
            return res.json(merged || localResult);
        } catch (error) {
            console.error('Gemini request failed:', error.response?.data || error.message);
            const status = error.response?.status;
            let message = error.response?.data?.error?.message || error.message || 'Unknown error';
            if (status === 429) {
                message = 'Gemini rate limit hit. Please wait a moment before retrying.';
            }
            const fallback = mergeAnalysisResults(localResult, {
                summary: `Gemini analysis unavailable (${message}). Showing local checks only.`,
                issues: [],
                recommendations: []
            });
            return res.json(fallback || localResult);
        }
    } catch (error) {
        console.error('AI layout check failed:', error.response?.data || error.message);
        const fallback = mergeAnalysisResults(localResult, {
            summary: 'Gemini analysis failed. Returning local results only.',
            issues: [],
            recommendations: [],
            error: error.response?.data || error.message
        });
        res.json(fallback || localResult);
    }
});

// ============================================
// GENERAL API ENDPOINTS
// ============================================

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Stellarion API is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        features: ['Database', 'Meshy 3D API', 'User Authentication']
    });
});

// Root route - serve the main page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found'
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Global error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ============================================
// START SERVER
// ============================================

const startServer = async () => {
    try {
        // Test database connection
        console.log('🔄 Connecting to database...');
        const dbConnected = await testConnection();
        if (dbConnected) {
            await initializeDatabase();
        } else {
            console.log('⚠️  Starting server without database connection');
            console.log('📝 Make sure MySQL is running and check your .env file');
        }

        app.listen(PORT, () => {
            console.log(`
╔═══════════════════════════════════════════════════╗
║         🚀 STELLARION SERVER RUNNING! 🚀          ║
╚═══════════════════════════════════════════════════╝

🌐 Server URL: http://localhost:${PORT}
📊 Database: ${process.env.DB_NAME || 'stellarion_furniture'}
🔗 Environment: ${process.env.NODE_ENV || 'development'}
🎯 3D API: Meshy AI Integration Ready

📋 Database API Endpoints:
   🔐 POST /api/users/register    - User registration
   🔑 POST /api/users/login       - User login
   👤 GET  /api/users/profile     - Get user profile
   ✏️  PUT  /api/users/profile     - Update profile
   🏢 POST /api/company-registration/register - Company registration
   🏢 GET  /api/company-registration/profile  - Get company profile
   🏢 PUT  /api/company-registration/profile  - Update company profile
   🏢 GET  /api/company-registration/         - Get all companies
   🏢 GET  /api/companies         - Get all companies (legacy)
   🏢 GET  /api/companies/:id     - Get company by ID (legacy)
   ➕ POST /api/companies         - Create company (Admin)
   ✏️  PUT  /api/companies/:id     - Update company (Admin)
   ❌ DEL  /api/companies/:id     - Delete company (Admin)

📋 3D Model API Endpoints:
   🎨 POST /api/create-3d-model   - Create 3D from image
   📊 GET  /api/check-status/:id  - Check 3D generation status
   📥 GET  /api/download/:id      - Download 3D model
   💾 POST /api/models/save       - Save model to database
   📁 GET  /api/models/my-models  - Get user's models
   🖼️  GET  /api/models/gallery    - Get public model gallery
   🗑️  DEL  /api/models/:id       - Delete user's model

📋 General Endpoints:
   ❤️  GET  /api/health           - Health check

Ready for users and 3D model generation! 🎉
            `);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

// Error handling
process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
});

startServer();
