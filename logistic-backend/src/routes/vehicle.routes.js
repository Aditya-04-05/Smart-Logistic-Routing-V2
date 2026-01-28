const express = require("express");
const router = express.Router();
const vehicleController = require("../controllers/vehicle.controller");

router.post("/", vehicleController.createVehicle);
router.get("/", vehicleController.getAllVehicles);
router.patch("/:id/status", vehicleController.updateVehicleStatus);
module.exports = router;
