const pool = require("../config/db");
const { successResponse, errorResponse } = require("../utils/response");

const createOrder = async (req, res) => {
  try {
    const {
      pickup_lat,
      pickup_lng,
      drop_lat,
      drop_lng,
      priority = "NORMAL",
    } = req.body;

    if (
      pickup_lat === undefined ||
      pickup_lng === undefined ||
      drop_lat === undefined ||
      drop_lng === undefined
    ) {
      return errorResponse(
        res,
        400,
        "Pickup and drop coordinates are required",
      );
    }

    const cords = [pickup_lat, pickup_lng, drop_lat, drop_lng];
    for (const c of cords) {
      if (typeof c != "number" || !Number.isFinite(c)) {
        return errorResponse(res, 400, "Coordinates must be valid number");
      }
    }
    if (
      pickup_lat < -90 ||
      pickup_lat > 90 ||
      drop_lat < -90 ||
      drop_lat > 90 ||
      pickup_lng < -180 ||
      pickup_lng > 180 ||
      drop_lng < -180 ||
      drop_lng > 180
    ) {
      return errorResponse(res, 400, "Invalid latitude or longitude range");
    }
    const allowedPriorities = ["LOW", "NORMAL", "HIGH"];
    if (!allowedPriorities.includes(priority)) {
      return errorResponse(res, 400, "priority must be LOW, NORMAL, or HIGH");
    }
    const query = `
            INSERT INTO orders (
                pickup_lat, pickup_lng,
                drop_lat, drop_lng,
                priority
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
    const result = await pool.query(query, [
      pickup_lat,
      pickup_lng,
      drop_lat,
      drop_lng,
      priority,
    ]);
    return successResponse(
      res,
      201,
      "Order created successfully",
      result.rows[0],
    );
  } catch (error) {
    console.error("Create order error: ", error);
    return errorResponse(res, 500, "Internal Server Error CreateOrder");
  }
};

const getOrders = async (req, res) => {
  try {
    const query = `
            SELECT id,
            pickup_lat,
            pickup_lng,
            drop_lat,
            drop_lng,
            priority,
            status,
            created_at
            FROM orders
        ORDER BY created_at DESC`;

    const result = await pool.query(query);

    return successResponse(res, 200, "Orders Fetched Successfully", {
      count: result.rows.length,
      orders: result.rows,
    });
  } catch (error) {
    console.error("Get Orders Error: ", error);
    return errorResponse(res, 200, "Internal Server Error GetOrdersError");
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!id) {
      return errorResponse(res, 400, "Order Id is requires");
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(id)) {
      return errorResponse(res, 400, "invalid order id format");
    }

    const allowedStatus = [
      "CREATED",
      "ASSIGNED",
      "IN_PROGRESS",
      "DELIVERED",
      "CANCELLED",
    ];
    if (!status || !allowedStatus.includes(status)) {
      return errorResponse(
        res,
        400,
        "status must be CREATED, ASSIGNED, IN_PROGRESS, DELIVERED, or CANCELLED",
      );
    }

    const query = `UPDATE orders SET status =$1 WHERE id = $2 RETURNING *`;

    const result = await pool.query(query, [status, id]);

    if (result.rows.length === 0) {
      return errorResponse(res, 404, "Order not found");
    }

    return successResponse(
      res,
      200,
      "Order status updated successfully",
      result.rows[0],
    );
  } catch (error) {
    console.error("Update Order Status Error: ", error);
    return errorResponse(
      res,
      500,
      "Internal Server Error: Update order status",
    );
  }
};

const startDelivery = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return errorResponse(res, 400, "Invalid order id");
    }

    await client.query("BEGIN");

    const orderRes = await client.query(
      "SELECT status FROM orders WHERE id = $1",
      [id],
    );

    if (orderRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return errorResponse(res, 404, "Order not found");
    }

    if (orderRes.rows[0].status !== "ASSIGNED") {
      await client.query("ROLLBACK");
      return errorResponse(res, 400, "Only ASSIGNED orders can be started");
    }

    await client.query(
      "UPDATE orders SET status = 'IN_PROGRESS' WHERE id = $1",
      [id],
    );

    await client.query(
      `
      INSERT INTO order_status_history (order_id, old_status, new_status, note)
      VALUES ($1, $2, $3, $4)
      `,
      [id, "ASSIGNED", "IN_PROGRESS", "delivery started"],
    );

    await client.query("COMMIT");

    return successResponse(res, 200, "Delivery started", {
      order_id: id,
      status: "IN_PROGRESS",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Start Delivery Error:", error);
    return errorResponse(res, 500, "Failed to start delivery");
  } finally {
    client.release();
  }
};

const completeDelivery = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return errorResponse(res, 400, "Invalid order id");
    }

    await client.query("BEGIN");

    // 1️⃣ Check order status
    const orderRes = await client.query(
      "SELECT status FROM orders WHERE id = $1",
      [id],
    );
    if (orderRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return errorResponse(res, 404, "Order not found");
    }
    if (orderRes.rows[0].status !== "IN_PROGRESS") {
      await client.query("ROLLBACK");
      return errorResponse(
        res,
        400,
        "Only IN_PROGRESS orders can be completed",
      );
    }

    // 2️⃣ Find assignment (if any)
    const assignRes = await client.query(
      `
      SELECT vehicle_id
      FROM order_vehicle_assignments
      WHERE order_id = $1
      `,
      [id],
    );

    // 3️⃣ Update order status
    await client.query("UPDATE orders SET status = 'DELIVERED' WHERE id = $1", [
      id,
    ]);

    // 4️⃣ Insert history
    await client.query(
      `
      INSERT INTO order_status_history (order_id, old_status, new_status, note)
      VALUES ($1, $2, $3, $4)
      `,
      [id, "IN_PROGRESS", "DELIVERED", "delivery completed"],
    );

    // 5️⃣ If assigned → free vehicle + remove assignment
    if (assignRes.rows.length > 0) {
      const vehicleId = assignRes.rows[0].vehicle_id;

      await client.query(
        "UPDATE vehicles SET status = 'AVAILABLE' WHERE id = $1",
        [vehicleId],
      );

      await client.query(
        "DELETE FROM order_vehicle_assignments WHERE order_id = $1",
        [id],
      );
    }

    await client.query("COMMIT");

    return successResponse(res, 200, "Delivery completed", {
      order_id: id,
      status: "DELIVERED",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Complete Delivery Error:", error);
    return errorResponse(res, 500, "Failed to complete delivery");
  } finally {
    client.release();
  }
};

const cancelOrder = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(id)) {
      return errorResponse(res, 400, "Invalid order id");
    }

    await client.query("BEGIN");

    // 1️⃣ Fetch order
    const orderRes = await client.query(
      "SELECT status FROM orders WHERE id = $1",
      [id],
    );

    if (orderRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return errorResponse(res, 404, "Order not found");
    }

    const currentStatus = orderRes.rows[0].status;

    if (currentStatus === "IN_PROGRESS" || currentStatus === "DELIVERED") {
      await client.query("ROLLBACK");
      return errorResponse(res, 400, "Order cannot be cancelled at this stage");
    }

    // 2️⃣ If ASSIGNED → unassign
    if (currentStatus === "ASSIGNED") {
      const assignmentRes = await client.query(
        `
        SELECT vehicle_id
        FROM order_vehicle_assignments
        WHERE order_id = $1
        `,
        [id],
      );

      if (assignmentRes.rows.length > 0) {
        const vehicleId = assignmentRes.rows[0].vehicle_id;

        await client.query(
          "DELETE FROM order_vehicle_assignments WHERE order_id = $1",
          [id],
        );

        await client.query(
          "UPDATE vehicles SET status = 'AVAILABLE' WHERE id = $1",
          [vehicleId],
        );
      }
    }

    // 3️⃣ Update order status
    await client.query("UPDATE orders SET status = 'CANCELLED' WHERE id = $1", [
      id,
    ]);

    // 4️⃣ Insert history
    await client.query(
      `
      INSERT INTO order_status_history (order_id, old_status, new_status, note)
      VALUES ($1, $2, $3, $4)
      `,
      [id, currentStatus, "CANCELLED", "order cancelled"],
    );

    await client.query("COMMIT");

    return successResponse(res, 200, "Order cancelled successfully", {
      order_id: id,
      status: "CANCELLED",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Cancel Order Error:", error);
    return errorResponse(res, 500, "Failed to cancel order");
  } finally {
    client.release();
  }
};

const getHistory = async (req, res) => {
  try {
    const { id } = req.params;

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(id)) {
      return errorResponse(res, 400, "Invalid order id");
    }

    // Optional: ensure order exists
    const orderCheck = await pool.query("SELECT id FROM orders WHERE id = $1", [
      id,
    ]);
    if (orderCheck.rows.length === 0) {
      return errorResponse(res, 404, "Order not found");
    }

    const historyRes = await pool.query(
      `
      SELECT
        *
      FROM order_status_history
      WHERE order_id = $1
      ORDER BY changed_at ASC
      `,
      [id],
    );

    return successResponse(res, 200, "Order history fetched", {
      order_id: id,
      events: historyRes.rows,
    });
  } catch (error) {
    console.error("Get Order History Error:", error);
    return errorResponse(res, 500, "Failed to fetch order history");
  }
};

module.exports = {
  createOrder,
  getOrders,
  updateOrderStatus,
  startDelivery,
  completeDelivery,
  cancelOrder,
  getHistory,
};
