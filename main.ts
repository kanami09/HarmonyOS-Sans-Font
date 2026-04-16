import fs from "fs";
import * as opentype from "opentype.js";
import { execSync } from "child_process";

interface ResponseJsonData {
    children: {
        uId: string;
        vueAppComponentRawValue: {
            Title?: { value: string };
            CardList: {
                rawValue: {
                    cardTitle: { value: string };
                    Download: {
                        rawValue: {
                            Link: { href: string };
                            Size: { value: string };
                            Date: { value: string };
                        }[];
                    };
                }[];
            };
        };
    }[];
}

interface FontInfo {
    fileName: string;
    fileDate: string;
    fileSize: string;
    downloadUrl: string;
}

async function main() {
    const fileDir = "./files";
    const tmpDir = "./tmp";
    fs.mkdirSync(fileDir, { recursive: true });
    fs.mkdirSync(tmpDir, { recursive: true });
    const fontName = "HarmonyOS_Sans.zip";
    const infoName = "font.json";

    // 获取json和文件信息
    const response = await fetch(
        "https://developer.huawei.com/consumer/cn/design/resource/",
    );
    if (!response.ok) {
        throw new Error("资源页面请求失败:" + response.statusText);
    }
    const html = await response.text();
    const jsonStr = html.match(
        /JSON.parse\(decodeURIComponent\("([^"]+)"\)\)/,
    )?.[1];
    if (!jsonStr) {
        throw new Error("从 HTML 中提取 JSON 数据失败");
    }
    const jsonRoot: ResponseJsonData = JSON.parse(decodeURIComponent(jsonStr));
    const child = jsonRoot.children.find(
        (ele) => ele.vueAppComponentRawValue.Title?.value === "通用设计",
    );
    const card = child?.vueAppComponentRawValue.CardList.rawValue.find(
        (ele) => ele.cardTitle.value === "HarmonyOS Sans 字体",
    );
    const downloadEntry = card?.Download.rawValue[0];
    const downloadUrl = downloadEntry?.Link.href;
    const fileDate = downloadEntry?.Date.value;
    const fileSize = downloadEntry?.Size.value;
    if (!card || !downloadUrl || !fileDate || !fileSize) {
        throw new Error("未找到文件信息");
    }
    console.log("解析到字体信息：");
    console.log("文件日期:", fileDate);
    console.log("文件大小:", fileSize);
    console.log("下载链接:", downloadUrl);

    // 比对文件日期，确认是否下载
    if (fs.existsSync(`${fileDir}/${infoName}`)) {
        const existingInfo: FontInfo = JSON.parse(
            fs.readFileSync(`${fileDir}/${infoName}`, "utf-8"),
        );
        if (existingInfo.fileDate === fileDate) {
            console.log("版本已是最新");
            return;
        }
    }

    // 下载字体文件，并记录信息
    console.log("正在下载...");
    const fontResponse = await fetch(downloadUrl);
    if (!fontResponse.ok) {
        throw new Error("下载字体文件失败:" + fontResponse.statusText);
    }
    const fileInfo: FontInfo = {
        fileName: card.cardTitle.value,
        fileDate: fileDate,
        fileSize: fileSize,
        downloadUrl: downloadUrl,
    };
    const buffer = await fontResponse.arrayBuffer();
    fs.writeFileSync(`${tmpDir}/${fontName}`, Buffer.from(buffer));
    fs.writeFileSync(
        `${fileDir}/${infoName}`,
        JSON.stringify(fileInfo, null, 4) + "\n",
    );

    // 解压缩并获取版本信息
    console.log("正在清理旧版本...");
    for (const entry of fs.readdirSync(fileDir)) {
        if (entry !== infoName) {
            fs.rmSync(`${fileDir}/${entry}`, {
                recursive: true,
                force: true,
            }); // 清理旧文件
        }
    }
    execSync(`7z x "${tmpDir}/${fontName}" -o"${tmpDir}"`);
    // workaround: fs.cpSync 在 Windows 上处理非 ASCII 路径时会崩溃
    // 加 filter: () => true 可绕过此问题
    // Node.js issue: https://github.com/nodejs/node/issues/61878
    // 修复版本: v25.9.0
    fs.cpSync(`${tmpDir}/HarmonyOS+Sans+字体/HarmonyOS Sans 字体`, fileDir, {
        recursive: true,
        force: true,
        filter: () => true,
    });
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log("解压成功");
    const ttfFiles = fs
        .readdirSync(fileDir, { recursive: true })
        .filter(
            (f): f is string => typeof f === "string" && f.endsWith(".ttf"),
        );
    if (ttfFiles.length === 0) {
        throw new Error("未找到 ttf 文件");
    }
    const font = opentype.loadSync(`${fileDir}/${ttfFiles[0]}`);
    const fontVer = Object.values(font.names.version)[0]?.replace(
        /^Version\s*/i,
        "",
    );
    if (!fontVer) {
        throw new Error("未找到版本");
    }
    fs.writeFileSync(`${fileDir}/.version`, fontVer);
    console.log(`更新到新版本: ${fontVer}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
