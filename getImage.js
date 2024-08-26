// @ts-check
import path from "path";
import fs from "fs";
import { config } from "./config.js";

const JOIN_ASSETS_PATH = path.join(process.cwd(), config.JOIN_PATH);

export async function getRandomJoinImage() {
    const files = await fs.promises.readdir(JOIN_ASSETS_PATH, { withFileTypes: true }).catch(_ => []);
    if (files.length == 0) {
        return null;
    }

    const images = files.filter((file) => file.isFile()).map((file) => file.name);

    const randomImage = images[Math.floor(Math.random() * images.length)];
    return path.join(JOIN_ASSETS_PATH, randomImage);
}
