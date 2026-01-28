const express = require("express");
const router = express.Router();
const routeController = require("../controllers/route.controller");

router.get("/vehicle/:vehicleId", routeController.getVehicleRoute);

module.exports = router;
