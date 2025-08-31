import fs from "fs";
import sharp from "sharp";
import path from "path";

// a few kernels 
const KERNELS = {
    edge: {width: 3, height: 3, kernel: [ -1,-1,-1, -1,8,-1, -1,-1,-1 ]},
    emboss: {width: 3, height: 3, kernel: [ -2,-1,0, -1,1,1, 0,1,2]},
    blur5: {width: 5, height: 5, kernel: Array(25).fill(1/25)}
};

/**
 * Runs a heavy pipeline repeatedly to burn CPU with meaningful output 
 * - Upscales to ~4K width
 * - Sharpen + median + normalize
 * - Re-encode JPEG with high quality
 * repeats 'iterations' times
 */
export async function processImage(inputPath, outDir, jobId, iterations = 30, kernel = "edge") {
    const selected = KERNELS[kernel] || KERNELS.edge;

    // start with a large working buffer to increase CPU work
    let buffer = await sharp(inputPath, { limitInputPixels: false})
        .resize({width: 3840, withoutEnlargement: false})
        .toBuffer();

    const t0 = Date.now();
        for (let i = 0; i < iterations; i++) {
        buffer = await sharp(buffer, {limitInputPixels: false})
            .convolve(selected)  // custom processing
            .sharpen()
            .median(7)
            .normalize()
            .jpeg({quality: 92 })
            .toBuffer();
    }

    const durationMs = Date.now() - t0;

    // persist output
    fs.mkdirSync(outDir, { recursive: true});
    const outPath = path.join(outDir, `${jobId}.jpg`);
    fs.writeFileSync(outPath, buffer);

    // also produce a thumbnail (extra unstrutured data)
    const thumbPath = path.join(outDir, `${jobId}.thumb.jpg`);
    await sharp(outPath).resize({ width: 256}).jpeg({quality: 80}).toFile(thumbPath);

    return {outPath, thumbPath, durationMs, kernel: selected === KERNELS[kernel] ? kernel : "edge"};

}