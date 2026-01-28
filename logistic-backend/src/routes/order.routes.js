const express = require("express");
const router = express.Router();
const orderController = require("../controllers/order.controller");

router.post("/", orderController.createOrder);
router.get("/", orderController.getOrders);
router.patch("/:id/status", orderController.updateOrderStatus);
router.patch("/:id/start", orderController.startDelivery);
router.patch("/:id/complete", orderController.completeDelivery);
router.patch("/:id/cancel", orderController.cancelOrder);
router.get("/:id/history", orderController.getHistory);
module.exports = router;
