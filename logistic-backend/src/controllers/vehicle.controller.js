const pool = require("../config/db");
const { successResponse, errorResponse } = require("../utils/response");

const createVehicle = async (req, res) => {
  try {
    const { capacity } = req.body;
    // capacity empty
    if (capacity === undefined) {
      return errorResponse(res, 400, "capacity is required");
    }

    // capacity abc
    if (typeof capacity !== "number") {
      return errorResponse(res, 400, "capacity must be a number");
    }

    // capacity negative
    if (capacity <= 0) {
      return errorResponse(res, 400, "capacity must be greater than 0");
    }

    const query = `
        INSERT INTO vehicles(capacity)
        VALUES ($1)
        RETURNING *
        `;

    const result = await pool.query(query, [capacity]);
    return successResponse(
      res,
      201,
      "Vehicle Created Successfully",
      result.rows[0],
    );
  } catch (error) {
    console.error("Create Vehicle Error", error);
    return errorResponse(
      res,
      500,
      "Internal Server Error : CreateVehicleController",
    );
  }
};

const getAllVehicles = async (req, res) => {
  try {
    const query = "SELECT * FROM vehicles ORDER BY created_at DESC";
    const result = await pool.query(query);
    return successResponse(res, 200, "Vehicles fetched successfully", {
      count: result.rows.length,
      vehicles: result.rows,
    });
  } catch (error) {
    console.error("Get Vehicles error: ", error);
    return errorResponse(
      res,
      500,
      "Failed to fetch vehicles : GETVehicles error",
    );
  }
};

const updateVehicleStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const allowedStatuses = ["AVAILABLE", "BUSY", "OFFLINE"];
    if (!id) {
      return errorResponse(res, 400, "vehicle id is required");
    }
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(id)) {
      return errorResponse(res, 400, "invalid vehicle id format");
    }

    if (!status || !allowedStatuses.includes(status)) {
      return errorResponse(
        res,
        400,
        "status must be AVAILABLE, BUSY, or OFFLINE",
      );
    }

    const query = `UPDATE vehicles SET status = $1 WHERE id = $2 RETURNING *`;
    const result = await pool.query(query, [status, id]);

    if (result.rows.length === 0) {
      return errorResponse(res, 404, "Vehicle Not Found");
    }
    return successResponse(
      res,
      200,
      "Vehicle status updated successfully",
      result.rows[0],
    );
  } catch (error) {
    console.error("Update Vehicle Error: ", error);
    return errorResponse(res, 500, "Failed to update vehicle status");
  }
};
module.exports = {
  createVehicle,
  getAllVehicles,
  updateVehicleStatus,
};
