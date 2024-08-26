// @ts-check
import { API, GroupEventType, MessageType, Zalo } from "zca-js";
import { config } from "./config.js";
import { getRandomJoinImage } from "./getImage.js";
import fs from "node:fs";
import path from "node:path";

if (!process.env.imei) {
    throw new Error("IMEI is required");
}

if (!process.env.cookie) {
    throw new Error("Cookie is required");
}

if (!process.env.user_agent) {
    throw new Error("User agent is required");
}

let groupData = {};

const zalo = new Zalo(
    {
        imei: process.env.imei,
        cookie: process.env.cookie,
        userAgent: process.env.user_agent,
    },
    {
        selfListen: true,
    }
);

const api = await zalo.login();

api.listener.on("connected", () => {
    console.log("Connected");

    try {
        const data = fs.readFileSync(path.join(process.cwd(), "assets", "group.json"), "utf-8");
        groupData = JSON.parse(data);
    } catch (err) {
        console.error(err);
    }

    let _updateData = setInterval(() => {
        updateData();
    }, 1000 * 60 * 5);

    process.on("SIGINT", () => {
        updateData();
        clearInterval(_updateData);
        process.exit();
    });
})

api.listener.on("group_event", async (event) => {
    const { updateMembers } = event.data;
    if (updateMembers && updateMembers.some((member) => member.id === api.getOwnId())) return;
    if (event.type !== GroupEventType.JOIN) return;

    let msg,
        mentions = [];

    let group = Object.assign(config, groupData[event.threadId] || {});
    if (event.data.updateMembers.length == 1) {
        const startPos = group.JOIN_MESSAGE.SINGLE.indexOf("{name}");
        msg = group.JOIN_MESSAGE.SINGLE.replace("{name}", "@" + event.data.updateMembers[0].dName);

        if(startPos != -1) mentions.push({
            len: event.data.updateMembers[0].dName.length + 1,
            pos: startPos,
            uid: event.data.updateMembers[0].id,
        });
    } else {
        const startPos = group.JOIN_MESSAGE.MULTI.indexOf("{names}");
        msg = group.JOIN_MESSAGE.MULTI.replace(
            "{names}",
            event.data.updateMembers.map((member) => "@" + member.dName).join(", ")
        );

        let currentPos = startPos;
        if(startPos != -1) event.data.updateMembers.forEach((member) => {
            const pos = currentPos;
            currentPos += member.dName.length + 3;
            mentions.push({
                len: member.dName.length + 1,
                pos,
                uid: member.id,
            });
        });
    }

    const message = {
        msg,
        mentions,
    };

    let image;

    if (group.JOIN_PATH === config.JOIN_PATH) {
        image = await getRandomJoinImage();
    } else if(fs.existsSync(group.JOIN_PATH)) {
        image = path.join(group.JOIN_PATH)
    }
    
    if (image) {
        message.attachments = [image];
    }

    api.sendMessage(message, event.threadId, MessageType.GroupMessage)
        .then(console.log)
        .catch(console.error);
});

api.listener.on("message", async (message) => {
    if (
        typeof message.data.content === 'string' &&
        message.data.content.startsWith(config.PREFIX)
    ) {
        const args = message.data.content.slice(config.PREFIX.length).trim().split(/ +/);
        const command = args.shift();

        if (command === "group") {
            if (args.length === 0 || message.type === MessageType.DirectMessage) return;

            let group = groupData[message.threadId] || {};
            const subCommand = args.shift();

            switch (subCommand) {
                case "JOIN_MESSAGE_SINGLE": {
                    if(args.length === 0) {
                        api.sendMessage("Vui lòng nhập tin nhắn chào mừng", message.threadId, message.type);
                        return;
                    }
                    if(!group.JOIN_MESSAGE) group.JOIN_MESSAGE = {};
                    group.JOIN_MESSAGE["SINGLE"] = args.join(" ");
                    groupData[message.threadId] = group;

                    api.sendMessage("Đã cập nhật tin nhắn chào mừng thành công", message.threadId, message.type);
                    break;
                }
                case "JOIN_MESSAGE_MULTI": {
                    if(args.length === 0) {
                        api.sendMessage("Vui lòng nhập tin nhắn chào mừng", message.threadId, message.type);
                        return;
                    }
                    if(!group.JOIN_MESSAGE) group.JOIN_MESSAGE = {};
                    group.JOIN_MESSAGE["MULTI"] = args.join(" ");
                    groupData[message.threadId] = group;

                    api.sendMessage("Đã cập nhật tin nhắn chào mừng thành công", message.threadId, message.type);
                    break;
                }
                case "JOIN_IMAGE": {
                    if (!message.data.quote) {
                        api.sendMessage("Vui lòng reply một ảnh", message.threadId, message.type);
                        return;
                    }

                    const attach = JSON.parse(message.data.quote.attach);
                    const extFile = attach.href.split(".").pop();
                    const filePath = path.join(process.cwd(), "assets", "join", `${message.threadId}.${extFile}`);

                    await downloadFile(filePath, attach.href);

                    group.JOIN_PATH = filePath;
                    groupData[message.threadId] = group;

                    api.sendMessage("Đã cập nhật ảnh chào mừng thành công", message.threadId, message.type);
                    break;
                }
                default: {
                    return;
                }
            }
        }
    }
});

api.listener.start();

function updateData() {
    fs.writeFileSync(path.join(process.cwd(), "assets", "group.json"), JSON.stringify(groupData), "utf-8");
}

async function downloadFile(path, url) {
    try {
        const res = await fetch(url);
        const fileStream = fs.createWriteStream(path);
        await (new Promise((resolve, reject) => {
            res.arrayBuffer().then((buffer) => {
                fileStream.write(Buffer.from(buffer));
                fileStream.end();
            });
            fileStream.on("finish", resolve);
        }));
    } catch (err) {
        console.error(err);
    }
}