const pool = require("../config/db");
const { successResponse, errorResponse } = require("../utils/response");

const getDistanceKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const runAssignment = async (req, res) => {
  try {
    // 1️⃣ Fetch unassigned CREATED orders
    const ordersResult = await pool.query(`
      SELECT o.*
      FROM orders o
      LEFT JOIN order_vehicle_assignments ova
        ON o.id = ova.order_id
      WHERE o.status = 'CREATED'
        AND ova.order_id IS NULL
      ORDER BY o.created_at ASC
    `);

    // 2️⃣ Fetch AVAILABLE vehicles
    const vehiclesResult = await pool.query(`
      SELECT *
      FROM vehicles
      WHERE status = 'AVAILABLE'
      ORDER BY created_at ASC
    `);

    let remainingOrders = [...ordersResult.rows];
    const assignmentPlan = [];
    const MAX_RADIUS_KM = 5;

    // 🔹 Build assignment plan (SAME AS BEFORE)
    for (const vehicle of vehiclesResult.rows) {
      if (remainingOrders.length === 0) break;

      const capacity = vehicle.capacity;
      const selectedOrders = [];

      // Anchor order
      const anchor = remainingOrders.shift();
      selectedOrders.push(anchor);

      let i = 0;
      while (selectedOrders.length < capacity && i < remainingOrders.length) {
        const candidate = remainingOrders[i];

        const distance = getDistanceKm(
          anchor.drop_lat,
          anchor.drop_lng,
          candidate.drop_lat,
          candidate.drop_lng,
        );

        if (distance <= MAX_RADIUS_KM) {
          selectedOrders.push(candidate);
          remainingOrders.splice(i, 1);
        } else {
          i++;
        }
      }

      assignmentPlan.push({
        vehicle_id: vehicle.id,
        orders: selectedOrders,
      });
    }

    // 🔥 REAL DB WRITES START HERE
    let vehiclesUsed = 0;
    let ordersAssigned = 0;

    for (const plan of assignmentPlan) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        for (const order of plan.orders) {
          // Insert assignment
          await client.query(
            `
            INSERT INTO order_vehicle_assignments (order_id, vehicle_id)
            VALUES ($1, $2)
            `,
            [order.id, plan.vehicle_id],
          );

          // Update order status
          await client.query(
            `
            UPDATE orders
            SET status = 'ASSIGNED'
            WHERE id = $1
            `,
            [order.id],
          );

          // Insert history
          await client.query(
            `
            INSERT INTO order_status_history
              (order_id, old_status, new_status, note)
            VALUES ($1, $2, $3, $4)
            `,
            [order.id, "CREATED", "ASSIGNED", "auto assignment engine"],
          );

          ordersAssigned++;
        }

        // Mark vehicle BUSY
        await client.query(
          `
          UPDATE vehicles
          SET status = 'BUSY'
          WHERE id = $1
          `,
          [plan.vehicle_id],
        );

        await client.query("COMMIT");
        vehiclesUsed++;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`Assignment failed for vehicle ${plan.vehicle_id}`, err);
      } finally {
        client.release();
      }
    }

    return successResponse(res, 200, "Assignment engine executed", {
      vehicles_used: vehiclesUsed,
      orders_assigned: ordersAssigned,
      orders_remaining: remainingOrders.length,
    });
  } catch (error) {
    console.error("Run Assignment Error:", error);
    return errorResponse(res, 500, "Failed to run assignment engine");
  }
};

module.exports = {
  runAssignment,
};
