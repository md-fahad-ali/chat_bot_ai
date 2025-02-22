import express from "express";
import dotenv from "dotenv";
import { searchProducts } from './textProduct.js';
import { searchProductsImage } from './imageProduct.js';
import cors from 'cors';
import multer from "multer";
import fs from 'fs';
dotenv.config();
import Bot from 'messenger-bot';

export const app = express();
app.use(cors());
const port = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.set("view engine", "ejs");


app.get("/", (req, res) => {
    res.render("pages/index");
});

app.post("/text-search", async (req, res) => {
    console.log(req.body);
    const data = await searchProducts(req.body);
    console.log(data);
    res.json(data);
});

export const upload = multer({ storage: multer.memoryStorage() });


app.post("/image-search", upload.single("image"), async (req, res) => {
    let tempPath;

    if (!req.file) {
        return res.status(400).json({ error: "No image uploaded" });
    }
    console.log(req.file)

    // tempPath = `./temp_${Date.now()}.jpg`;
    // fs.writeFileSync(tempPath, req.file.buffer);

    const data = await searchProductsImage(req, res);

    console.log(data?.similarImages);

    // console.log(req.file)
    res.json({
        queryImage: data?.similarImages,
    });


    // console.log(data);
    // res.json(data);
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});