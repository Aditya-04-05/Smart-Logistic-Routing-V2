const pool = require("../config/db");
const { successResponse, errorResponse } = require("../utils/response");

// Distance helper (same math, reused)
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

const getVehicleRoute = async (req, res) => {
  try {
    const { vehicleId } = req.params;

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(vehicleId)) {
      return errorResponse(res, 400, "Invalid vehicle id");
    }

    const result = await pool.query(
      `
      SELECT o.*
      FROM orders o
      JOIN order_vehicle_assignments ova ON o.id = ova.order_id
      WHERE ova.vehicle_id = $1
      ORDER BY ova.assigned_at ASC
      `,
      [vehicleId],
    );

    if (result.rows.length === 0) {
      return successResponse(res, 200, "No active route", {
        vehicle_id: vehicleId,
        stops: [],
      });
    }

    const unvisited = [...result.rows];

    if (!unvisited[0].pickup_lat || !unvisited[0].pickup_lng) {
      return errorResponse(res, 500, "Invalid pickup coordinates");
    }

    let currentLat = unvisited[0].pickup_lat;
    let currentLng = unvisited[0].pickup_lng;

    const route = [];

    while (unvisited.length > 0) {
      let nearestIndex = 0;
      let nearestDistance = Infinity;

      for (let i = 0; i < unvisited.length; i++) {
        const d = getDistanceKm(
          currentLat,
          currentLng,
          unvisited[i].drop_lat,
          unvisited[i].drop_lng,
        );

        if (d < nearestDistance) {
          nearestDistance = d;
          nearestIndex = i;
        }
      }

      const nextStop = unvisited.splice(nearestIndex, 1)[0];

      route.push({
        order_id: nextStop.id,
        lat: nextStop.drop_lat,
        lng: nextStop.drop_lng,
      });

      currentLat = nextStop.drop_lat;
      currentLng = nextStop.drop_lng;
    }

    return successResponse(res, 200, "Route generated", {
      vehicle_id: vehicleId,
      stops: route,
    });
  } catch (error) {
    console.error("Route generation error:", error.message);
    return errorResponse(res, 500, "Failed to generate route");
  }
};

module.exports = {
  getVehicleRoute,
};
