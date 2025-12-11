const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

// Logging middleware for every incoming request
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log("Request Body:", req.body);
  next();
});

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN; // set ACCESS_TOKEN in your .env

app.post("/webhook/orders-create", async (req, res) => {
  const order = req.body;
  console.log(`Processing order: ${order.id}`);

  // Check if shipping method is FedEx Ground Economy
  const shippingLine = order.shipping_lines.find(
    (line) => line.title.includes("Fedex") || line.source.includes("fedex")
  );

  if (!shippingLine) {
    console.log(
      `Order ${order.id}: No FedEx Ground Economy shipping line found. Skipping.`
    );
    return res.sendStatus(200); // nothing to do
  }

  console.log(`Order ${order.id}: FedEx Ground Economy shipping line found.`);

  // Calculate total weight in grams
  let totalWeightGrams = order.line_items.reduce((sum, item) => {
    return sum + item.grams * item.quantity;
  }, 0);

  console.log(
    `Order ${order.id}: Total weight calculated as ${totalWeightGrams} grams.`
  );

  // If total weight < 1 lb (~453.6 g), update fulfillment
  if (totalWeightGrams < 453.6) {
    console.log(
      `Order ${order.id}: Weight < 453.6g, updating fulfillment to 453.6g.`
    );
    try {
      const fulfillmentData = {
        fulfillment: {
          location_id: order.location_id,
          tracking_numbers: [],
          notify_customer: false,
          line_items: order.line_items.map((item) => ({
            id: item.id,
            quantity: item.quantity,
          })),
          // Set weight for shipping label
          weight: 453.6,
        },
      };

      console.log(
        `Order ${order.id}: Sending fulfillment update:`,
        JSON.stringify(fulfillmentData, null, 2)
      );

      await axios.post(
        `https://${SHOPIFY_STORE}/admin/api/2025-10/orders/${order.id}/fulfillments.json`,
        fulfillmentData,
        {
          headers: {
            "X-Shopify-Access-Token": ACCESS_TOKEN,
            "Content-Type": "application/json",
          },
        }
      );

      console.log(`Order ${order.id}: Fulfillment updated successfully.`);
    } catch (err) {
      console.error(
        `Order ${order.id}: Error updating fulfillment:`,
        err.response?.data || err.message
      );
    }
  } else {
    console.log(`Order ${order.id}: Weight >= 453.6g, no update needed.`);
  }

  console.log(`Order ${order.id}: Processing complete.`);
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Webhook server running on port ${PORT}`));
