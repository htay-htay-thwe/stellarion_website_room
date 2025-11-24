const express = require('express');
const {
    addToCart,
    getCart,
    updateCartItem,
    removeCartItem
} = require('../controllers/cartController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.post('/add', authenticateToken, addToCart);
router.get('/:userId', authenticateToken, getCart);
router.patch('/update', authenticateToken, updateCartItem);
router.delete('/remove/:cartItemId', authenticateToken, removeCartItem);

module.exports = router;
