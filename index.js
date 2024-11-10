const express = require("express");
const cors = require("cors");
const { neon } = require("@neondatabase/serverless");
const multer = require("multer");
const fs = require("fs");  // Importar el módulo fs
const app = express();
app.use(express.json());
app.use(cors());
const port = 3000;

const sql = neon('postgresql://bazar_owner:e6pWxYfgSIh0@ep-shiny-haze-a5xropz5-pooler.us-east-2.aws.neon.tech/bazar?sslmode=require');

const upload = multer({ dest: 'uploads/' });

app.get("/", (req, res) => {
  res.send("API Funcionando");
});
app.post("/api/load-data", express.json(), async (req, res) => {  // Asegúrate de tener el middleware express.json() para procesar JSON
  try {
    const data = req.body;  // Usa directamente req.body, no necesitas JSON.parse()

    for (const item of data) {
      const dimensions = await sql`
        INSERT INTO dimension (width, height, depth)
        VALUES (${item.dimensions?.width || 0}, ${item.dimensions?.height || 0}, ${item.dimensions?.depth || 0})
        RETURNING id
      `;

      const meta = await sql`
        INSERT INTO meta (created_at, updated_at, barcode, qr_code)
        VALUES (${item.meta?.createdAt || ''}, ${item.meta?.updatedAt || ''}, ${item.meta?.barcode || ''}, ${item.meta?.qrCode || ''})
        RETURNING id
      `;

      const product = await sql`
        INSERT INTO product (
          title, description, category, price, discount_percentage, rating, stock, tags, brand, sku, weight,
          dimensions_id, warranty_information, shipping_information, availability_status, return_policy,
          minimum_order_quantity, meta_id, images, thumbnail
        ) VALUES (
          ${item.title || ''}, ${item.description || ''}, ${item.category || ''}, ${item.price || 0.0}, ${item.discountPercentage || 0.0}, ${item.rating || 0.0},
          ${item.stock || 0}, ${JSON.stringify(item.tags || [])}, ${item.brand || ''}, ${item.sku || ''}, ${item.weight || 0.0}, ${dimensions[0].id},
          ${item.warrantyInformation || ''}, ${item.shippingInformation || ''}, ${item.availabilityStatus || ''}, ${item.returnPolicy || ''},
          ${item.minimumOrderQuantity || 0}, ${meta[0].id}, ${JSON.stringify(item.images || [])}, ${item.thumbnail || ''}
        )
        RETURNING id
      `;

      for (const review of item.reviews || []) {
        const reviewRecord = await sql`
          INSERT INTO review (rating, comment, date, reviewer_name, reviewer_email)
          VALUES (${review.rating || 0}, ${review.comment || ''}, ${review.date || ''}, ${review.reviewerName || ''}, ${review.reviewerEmail || ''})
          RETURNING id
        `;

        await sql`
          INSERT INTO product_reviews (product_id, review_id)
          VALUES (${product[0].id}, ${reviewRecord[0].id})
        `;
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});


// get para los productos
app.get("/api/items", async (req, res) => {
  try {
    const query = req.query.q || '';
    const products = await sql`
      SELECT * FROM product
      WHERE title LIKE ${'%' + query + '%'}
    `;

    // Hacemos los inner join para obtener los datos de las tablas relacionadas
    for (const product of products) {
      const dimensions = await sql`
        SELECT * FROM dimension WHERE id = ${product.dimensions_id}
      `;

      const meta = await sql`
        SELECT * FROM meta WHERE id = ${product.meta_id}
      `;

      product.dimensions = dimensions[0];
      product.meta = meta[0];

      const reviews = await sql`
        SELECT review.* FROM review
        INNER JOIN product_reviews ON product_reviews.review_id = review.id
        WHERE product_reviews.product_id = ${product.id}
      `;

      product.reviews = reviews;
    }

    res.json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//get para el producto

app.get("/api/items/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const products = await sql`
      SELECT * FROM product
      WHERE id = ${id}
    `;

    // Hacemos los inner join para obtener los datos de las tablas relacionadas
    for (const product of products) {
      const dimensions = await sql`
        SELECT * FROM dimension WHERE id = ${product.dimensions_id}
      `;

      const meta = await sql`
        SELECT * FROM meta WHERE id = ${product.meta_id}
      `;

      product.dimensions = dimensions[0];
      product.meta = meta[0];

      const reviews = await sql`
        SELECT review.* FROM review
        INNER JOIN product_reviews ON product_reviews.review_id = review.id
        WHERE product_reviews.product_id = ${product.id}
      `;

      product.reviews = reviews;
    }

    res.json(products[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// post para registrar compras
app.post("/api/addSale", async (req, res) => {

  try {
    const { product_id, total } = req.body;

    const sale = await sql`
      INSERT INTO purchase (product_id, total_price, purchase_date)
      VALUES (${product_id}, ${total}, NOW())
    `;

    if (sale) {
      res.json({ success: true });
    }
    else {
      res.json({ success: false });
    }
  }
  catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/api/sales", async (req, res) => {
  try {
    const sales = await sql`
      SELECT purchase.*, product.title, product.thumbnail
      FROM purchase
      INNER JOIN product ON product.id = purchase.product_id
    `;

    res.json(sales);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});