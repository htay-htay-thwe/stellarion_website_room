const express = require('express');
const {
    checkout,
    getOrderById,
    getOrdersForUser
} = require('../controllers/orderController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.post('/checkout', authenticateToken, checkout);
router.get('/orders/user/:userId', authenticateToken, getOrdersForUser);
router.get('/orders/:orderId', authenticateToken, getOrderById);

module.exports = router;
