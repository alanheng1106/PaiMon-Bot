import fs from 'node:fs';
import path from 'node:path';

// 1. Patch unpdf/dist/pdfjs.mjs
const pdfjsPath = path.resolve(import.meta.dirname, '../node_modules/unpdf/dist/pdfjs.mjs');
if (fs.existsSync(pdfjsPath)) {
    let content = fs.readFileSync(pdfjsPath, 'utf8');

    if (content.includes('var u={}();')) {
        content = content.replace('var u={}();', 'var u={j:()=>{}};');
    }
    if (content.includes('var f={}();')) {
        content = content.replace('var f={}();', 'var f={j:()=>{}};');
    }

    const oldDecodeImage =
        'async decodeImage(e,t,n){if(this.eof)return this.buffer;e=Jbig2Stream.stripFileHeader(e||this.bytes);let r=null;if(this.params instanceof F){let e=this.params.get(`JBIG2Globals`);e instanceof BaseStream&&(r=Jbig2Stream.stripFileHeader(e.getBytes()))}return this.buffer=await Je.instance.decode(e,this.dict.get(`Width`),this.dict.get(`Height`),r),this.bufferLength=this.buffer.length,this.eof=!0,this.buffer}';

    const newDecodeImage =
        'async decodeImage(e,t,n){if(this.eof)return this.buffer;e=Jbig2Stream.stripFileHeader(e||this.bytes);let r=null;if(this.params instanceof F){let g=this.params.get(`JBIG2Globals`);g instanceof BaseStream&&(r=Jbig2Stream.stripFileHeader(g.getBytes()))}try{const{Jbig2Image:D}=await import("pdfjs-dist/image_decoders/pdf.image_decoders.mjs");let chunks=[];if(r&&r.length>0)chunks.push({data:r,start:0,end:r.length});chunks.push({data:e,start:0,end:e.length});const data=new D().parseChunks(chunks);if(data){for(let i=0;i<data.length;i++){data[i]^=0xff;}this.buffer=data;this.bufferLength=data.length;this.eof=!0;return this.buffer;}}catch(err){console.warn("[pdfjs.mjs] Jbig2Image failed:",err.message);}return this.buffer=await Je.instance.decode(e,this.dict.get(`Width`),this.dict.get(`Height`),r),this.bufferLength=this.buffer.length,this.eof=!0,this.buffer}';

    if (content.includes(oldDecodeImage)) {
        content = content.replace(oldDecodeImage, newDecodeImage);
    }

    fs.writeFileSync(pdfjsPath, content);
}

// 2. Patch pdfjs-dist/legacy/build/pdf.worker.mjs to fix null wasmUrl fallback import
const workerPath = path.resolve(import.meta.dirname, '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
if (fs.existsSync(workerPath)) {
    let content = fs.readFileSync(workerPath, 'utf8');
    const oldImport = '`${WasmImage.#wasmUrl}${this._noWasmFilename}`';
    const newImport = 'WasmImage.#wasmUrl ? `${WasmImage.#wasmUrl}${this._noWasmFilename}` : new URL(`../../wasm/${this._noWasmFilename}`, import.meta.url).href';

    if (content.includes(oldImport)) {
        content = content.replace(oldImport, newImport);
        fs.writeFileSync(workerPath, content);
        console.log('[patch-unpdf] Patched pdf.worker.mjs fallback import path.');
    }
}

// 3. Patch unpdf/dist/index.mjs and index.cjs to automatically pass wasmUrl in nodeDefaults
for (const rel of ['../node_modules/unpdf/dist/index.mjs', '../node_modules/unpdf/dist/index.cjs']) {
    const unpdfIndexPath = path.resolve(import.meta.dirname, rel);
    if (fs.existsSync(unpdfIndexPath)) {
        let content = fs.readFileSync(unpdfIndexPath, 'utf8');
        if (content.includes('cMapPacked: true') && !content.includes('wasmUrl')) {
            content = content.replace(
                'cMapPacked: true',
                'cMapPacked: true,\n\t\t\twasmUrl: new URL("./wasm/", base).href'
            );
            fs.writeFileSync(unpdfIndexPath, content);
            console.log(`[patch-unpdf] Patched wasmUrl into ${path.basename(rel)} nodeDefaults.`);
        }
    }
}

// 4. Patch pdfjs-dist/legacy/build/pdf.mjs to support file:// URLs on Windows in node_utils_fetchData
const legacyPdfMjsPath = path.resolve(import.meta.dirname, '../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
if (fs.existsSync(legacyPdfMjsPath)) {
    let content = fs.readFileSync(legacyPdfMjsPath, 'utf8');
    const oldFn =
        'async function node_utils_fetchData(url) {\n  const fs = process.getBuiltinModule("fs/promises");\n  const data = await fs.readFile(url);\n  return new Uint8Array(data);\n}';
    const newFn =
        'async function node_utils_fetchData(url) {\n  const fs = process.getBuiltinModule("fs/promises");\n  const target = typeof url === "string" && url.startsWith("file://") ? new URL(url) : url;\n  const data = await fs.readFile(target);\n  return new Uint8Array(data);\n}';
    if (content.includes(oldFn)) {
        content = content.replace(oldFn, newFn);
        fs.writeFileSync(legacyPdfMjsPath, content);
        console.log('[patch-unpdf] Patched node_utils_fetchData in pdfjs-dist legacy build for Windows file:// URL support.');
    }
}

// 5. Also patch standard pdfjs-dist/build/pdf.mjs if present
const standardPdfMjsPath = path.resolve(import.meta.dirname, '../node_modules/pdfjs-dist/build/pdf.mjs');
if (fs.existsSync(standardPdfMjsPath)) {
    let content = fs.readFileSync(standardPdfMjsPath, 'utf8');
    const oldFn =
        'async function node_utils_fetchData(url) {\n  const fs = process.getBuiltinModule("fs/promises");\n  const data = await fs.readFile(url);\n  return new Uint8Array(data);\n}';
    const newFn =
        'async function node_utils_fetchData(url) {\n  const fs = process.getBuiltinModule("fs/promises");\n  const target = typeof url === "string" && url.startsWith("file://") ? new URL(url) : url;\n  const data = await fs.readFile(target);\n  return new Uint8Array(data);\n}';
    if (content.includes(oldFn)) {
        content = content.replace(oldFn, newFn);
        fs.writeFileSync(standardPdfMjsPath, content);
        console.log('[patch-unpdf] Patched node_utils_fetchData in pdfjs-dist standard build for Windows file:// URL support.');
    }
}

console.log('[patch-unpdf] Completed all PDF decoder compatibility patches.');
