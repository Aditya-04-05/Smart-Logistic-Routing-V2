const pool = require("../config/db");
const { successResponse, errorResponse } = require("../utils/response");

const createVehicle = async (req, res) => {
  try {
    const {
      vehicle_code,
      vehicle_role,
      capacity,
      max_range_km,
      start_lat,
      start_lng,
      zone_id,
    } = req.body;

    if (!vehicle_code) {
      return errorResponse(res, 400, "vehicle_code is required");
    }

    if (!["PICKUP", "LINE_HAUL", "DELIVERY"].includes(vehicle_role)) {
      return errorResponse(res, 400, "invalid vehicle_role");
    }

    if (typeof capacity !== "number" || capacity <= 0) {
      return errorResponse(res, 400, "capacity must be positive number");
    }

    if (typeof max_range_km !== "number" || max_range_km <= 0) {
      return errorResponse(res, 400, "max_range_km must be positive number");
    }

    const query = `
        INSERT INTO vehicles (
          vehicle_code,
          vehicle_role,
          capacity,
          max_range_km,
          start_lat,
          start_lng,
          zone_id,
          status
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,'AVAILABLE')
        RETURNING *
      `;

    const result = await pool.query(query, [
      vehicle_code,
      vehicle_role,
      capacity,
      max_range_km,
      start_lat,
      start_lng,
      zone_id,
    ]);

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
    const query = "SELECT vehicle_code, vehicle_role, capacity, max_range_km, zone_id FROM vehicles ORDER BY created_at DESC";
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
