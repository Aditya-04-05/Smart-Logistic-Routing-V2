const pool = require("../config/db");
const { successResponse, errorResponse } = require("../utils/response");

const assignOrderToVehicle = async (req, res) => {
  const client = await pool.connect(); // 🔐 start transaction client

  try {
    const { order_id, vehicle_id } = req.body;

    // 1️⃣ Basic checks
    if (!order_id || !vehicle_id) {
      return errorResponse(res, 400, "order_id and vehicle_id are required");
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(order_id) || !uuidRegex.test(vehicle_id)) {
      return errorResponse(res, 400, "Invalid UUID format");
    }

    // 🔐 BEGIN TRANSACTION
    await client.query("BEGIN");

    // 2️⃣ Check order exists & status
    const orderRes = await client.query(
      "SELECT id, status FROM orders WHERE id = $1",
      [order_id],
    );

    if (orderRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return errorResponse(res, 404, "Order not found");
    }

    if (orderRes.rows[0].status !== "CREATED") {
      await client.query("ROLLBACK");
      return errorResponse(res, 400, "Only CREATED orders can be assigned");
    }

    // 3️⃣ Check vehicle exists & availability
    const vehicleRes = await client.query(
      "SELECT id, status FROM vehicles WHERE id = $1",
      [vehicle_id],
    );

    if (vehicleRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return errorResponse(res, 404, "Vehicle not found");
    }

    if (vehicleRes.rows[0].status !== "AVAILABLE") {
      await client.query("ROLLBACK");
      return errorResponse(res, 400, "Vehicle is not AVAILABLE");
    }

    // 4️⃣ Create assignment
    const assignmentRes = await client.query(
      `
      INSERT INTO order_vehicle_assignments (order_id, vehicle_id)
      VALUES ($1, $2)
      RETURNING *
      `,
      [order_id, vehicle_id],
    );

    // 5️⃣ Auto-update order status
    await client.query("UPDATE orders SET status = 'ASSIGNED' WHERE id = $1", [
      order_id,
    ]);

    // 6️⃣ Auto-update vehicle status
    await client.query("UPDATE vehicles SET status = 'BUSY' WHERE id = $1", [
      vehicle_id,
    ]);
    await client.query(
      `
  INSERT INTO order_status_history (order_id, old_status, new_status, note)
  VALUES ($1, $2, $3, $4)
  `,
      [order_id, "CREATED", "ASSIGNED", "auto on assignment"],
    );

    // 🔐 COMMIT TRANSACTION
    await client.query("COMMIT");

    return successResponse(
      res,
      201,
      "Order assigned and statuses updated",
      assignmentRes.rows[0],
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Auto Assignment Error:", error);
    return errorResponse(res, 500, "Failed to assign order");
  } finally {
    client.release(); // 🔓 release connection
  }
};

const getAssignments = async (req, res) => {
  try {
    const query = `
      SELECT
        a.id AS assignment_id,
        a.assigned_at,
        o.id AS order_id,
        o.status AS order_status,
        v.id AS vehicle_id,
        v.status AS vehicle_status
      FROM order_vehicle_assignments a
      JOIN orders o ON o.id = a.order_id
      JOIN vehicles v ON v.id = a.vehicle_id
      ORDER BY a.assigned_at DESC
    `;

    const result = await pool.query(query);

    return successResponse(res, 200, "Assignments fetched successfully", {
      count: result.rows.length,
      assignments: result.rows,
    });
  } catch (error) {
    console.error("Get Assignments Error:", error);
    return errorResponse(res, 500, "Failed to fetch assignments");
  }
};

const unassignOrder = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!id || !uuidRegex.test(id)) {
      return errorResponse(res, 400, "Invalid assignment id");
    }

    await client.query("BEGIN");
    const assignmentRes = await client.query(
      `
      SELECT order_id, vehicle_id
      FROM order_vehicle_assignments
      WHERE id = $1
      `,
      [id],
    );
    if (assignmentRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return errorResponse(res, 404, "Assignment not found");
    }
    const { order_id, vehicle_id } = assignmentRes.rows[0];
    await client.query("DELETE FROM order_vehicle_assignments WHERE id = $1", [
      id,
    ]);

    await client.query("UPDATE orders SET status = 'CREATED' WHERE id = $1", [
      order_id,
    ]);

    await client.query(
      "UPDATE vehicles SET status = 'AVAILABLE' WHERE id = $1",
      [vehicle_id],
    );

    await client.query(
      `
  INSERT INTO order_status_history (order_id, old_status, new_status, note)
  VALUES ($1, $2, $3, $4)
  `,
      [order_id, "ASSIGNED", "CREATED", "auto on unassign"],
    );

    await client.query("COMMIT");

    return successResponse(res, 200, "Order unassigned successfully", {
      assignment_id: id,
      order_id,
      vehicle_id,
    });
  } catch (error) {
    console.error("Cannt Unassign order: ", error);
    return errorResponse(
      res,
      500,
      "Internal Server Error: Unassaignment module",
    );
  }
};
module.exports = {
  assignOrderToVehicle,
  getAssignments,
  unassignOrder,
};
