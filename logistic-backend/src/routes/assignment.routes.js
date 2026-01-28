const express = require("express");
const router = express.Router();
const assignmentController = require("../controllers/assignment.controller");
const assignmentEngineController = require("../controllers/assignment.engine.controller");

router.post("/", assignmentController.assignOrderToVehicle);
router.get("/", assignmentController.getAssignments);
router.delete("/:id", assignmentController.unassignOrder);
router.post("/rundemo", assignmentEngineController.runAssignment);

module.exports = router;
