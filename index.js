const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { execSync } = require('child_process');

// ==================== 环境变量配置 ====================
const UPLOAD_URL = process.env.UPLOAD_URL || '';
const PROJECT_URL = process.env.PROJECT_URL || '';
const AUTO_ACCESS = process.env.AUTO_ACCESS || 'true';
const FILE_PATH = process.env.FILE_PATH || './tmp';
const SUB_PATH = process.env.SUB_PATH || 'sub';
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const UUID = process.env.UUID || 'da67df1f-5131-4929-a3b2-22fd2c3ff0c5';
const NEZHA_SERVER = process.env.NEZHA_SERVER || '';
const NEZHA_PORT = process.env.NEZHA_PORT || '';
const NEZHA_KEY = process.env.NEZHA_KEY || '';
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || '';
const ARGO_AUTH = process.env.ARGO_AUTH || '';
const ARGO_PORT = process.env.ARGO_PORT || 2082;
const CFIP = process.env.CFIP || 'www.visa.com.sg';
const CFPORT = process.env.CFPORT || 443;
const NAME = process.env.NAME || 'galaxy';

// ==================== 保活计数器 ====================
let keepAliveCount = 0;
let startTime = Date.now();

// ==================== 创建运行目录 ====================
if (!fs.existsSync(FILE_PATH)) {
  fs.mkdirSync(FILE_PATH, { recursive: true });
  console.log(`${FILE_PATH} is created`);
} else {
  console.log(`${FILE_PATH} already exists`);
}

const npmPath = path.join(FILE_PATH, 'npm');
const phpPath = path.join(FILE_PATH, 'php');
const webPath = path.join(FILE_PATH, 'web');
const botPath = path.join(FILE_PATH, 'bot');
const subPath = path.join(FILE_PATH, 'sub.txt');
const listPath = path.join(FILE_PATH, 'list.txt');
const bootLogPath = path.join(FILE_PATH, 'boot.log');
const configPath = path.join(FILE_PATH, 'config.json');

// ==================== Express 路由 ====================
app.get("/", (req, res) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  res.send(`Hello world! | Uptime: ${uptime}s | Keep-alive count: ${keepAliveCount}`);
});

app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    keepAliveCount: keepAliveCount
  });
});

// 保活专用端点
app.get("/ping", (req, res) => {
  keepAliveCount++;
  res.status(200).send("pong");
});

app.get("/keep-alive", (req, res) => {
  keepAliveCount++;
  res.status(200).json({ status: "alive", count: keepAliveCount });
});

// ==================== 删除历史节点 ====================
function deleteNodes() {
  try {
    if (!UPLOAD_URL) return;
    if (!fs.existsSync(subPath)) return;
    let fileContent;
    try {
      fileContent = fs.readFileSync(subPath, 'utf-8');
    } catch {
      return null;
    }
    const decoded = Buffer.from(fileContent, 'base64').toString('utf-8');
    const nodes = decoded.split('\n').filter(line => 
      /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line)
    );
    if (nodes.length === 0) return;
    return axios.post(`${UPLOAD_URL}/api/delete-nodes`, 
      JSON.stringify({ nodes }),
      { headers: { 'Content-Type': 'application/json' } }
    ).catch(() => null);
  } catch (err) {
    return null;
  }
}

// ==================== 清理历史文件 ====================
function cleanupOldFiles() {
  const pathsToDelete = ['web', 'bot', 'npm', 'php', 'sub.txt', 'boot.log'];
  pathsToDelete.forEach(file => {
    const filePath = path.join(FILE_PATH, file);
    fs.unlink(filePath, () => {});
  });
}

// ==================== 生成配置文件 ====================
const config = {
  log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
  inbounds: [
    { 
      port: ARGO_PORT, 
      protocol: 'vless', 
      settings: { 
        clients: [{ id: UUID, flow: 'xtls-rprx-vision' }], 
        decryption: 'none', 
        fallbacks: [
          { dest: 3001 }, 
          { path: "/vless-argo", dest: 3002 }, 
          { path: "/vmess-argo", dest: 3003 }, 
          { path: "/trojan-argo", dest: 3004 }
        ] 
      }, 
      streamSettings: { network: 'tcp' } 
    },
    { port: 3001, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID }], decryption: "none" }, streamSettings: { network: "tcp", security: "none" } },
    { port: 3002, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID, level: 0 }], decryption: "none" }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/vless-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
    { port: 3003, listen: "127.0.0.1", protocol: "vmess", settings: { clients: [{ id: UUID, alterId: 0 }] }, streamSettings: { network: "ws", wsSettings: { path: "/vmess-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
    { port: 3004, listen: "127.0.0.1", protocol: "trojan", settings: { clients: [{ password: UUID }] }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/trojan-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
  ],
  dns: { servers: ["https+local://8.8.8.8/dns-query"] },
  outbounds: [{ protocol: "freedom", tag: "direct" }, { protocol: "blackhole", tag: "block" }]
};
fs.writeFileSync(path.join(FILE_PATH, 'config.json'), JSON.stringify(config, null, 2));

// ==================== 系统架构判断 ====================
function getSystemArchitecture() {
  const arch = os.arch();
  if (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') {
    return 'arm';
  }
  return 'amd';
}

// ==================== 下载文件 ====================
function downloadFile(fileName, fileUrl, callback) {
  const filePath = path.join(FILE_PATH, fileName);
  const writer = fs.createWriteStream(filePath);
  axios({ method: 'get', url: fileUrl, responseType: 'stream' })
    .then(response => {
      response.data.pipe(writer);
      writer.on('finish', () => {
        writer.close();
        console.log(`Download ${fileName} successfully`);
        callback(null, fileName);
      });
      writer.on('error', err => {
        fs.unlink(filePath, () => {});
        callback(`Download ${fileName} failed: ${err.message}`);
      });
    })
    .catch(err => callback(`Download ${fileName} failed: ${err.message}`));
}

// ==================== 获取下载文件列表 ====================
function getFilesForArchitecture(architecture) {
  let baseFiles;
  if (architecture === 'arm') {
    baseFiles = [
      { fileName: "web", fileUrl: "https://arm64.ssss.nyc.mn/web" },
      { fileName: "bot", fileUrl: "https://arm64.ssss.nyc.mn/2go" }
    ];
  } else {
    baseFiles = [
      { fileName: "web", fileUrl: "https://amd64.ssss.nyc.mn/web" },
      { fileName: "bot", fileUrl: "https://amd64.ssss.nyc.mn/2go" }
    ];
  }
  if (NEZHA_SERVER && NEZHA_KEY) {
    if (NEZHA_PORT) {
      const npmUrl = architecture === 'arm' ? "https://arm64.ssss.nyc.mn/agent" : "https://amd64.ssss.nyc.mn/agent";
      baseFiles.unshift({ fileName: "npm", fileUrl: npmUrl });
    } else {
      const phpUrl = architecture === 'arm' ? "https://arm64.ssss.nyc.mn/v1" : "https://amd64.ssss.nyc.mn/v1";
      baseFiles.unshift({ fileName: "php", fileUrl: phpUrl });
    }
  }
  return baseFiles;
}

// ==================== 下载并运行依赖文件 ====================
async function downloadFilesAndRun() {
  const architecture = getSystemArchitecture();
  const filesToDownload = getFilesForArchitecture(architecture);
  if (filesToDownload.length === 0) {
    console.log(`Can't find a file for the current architecture`);
    return;
  }
  const downloadPromises = filesToDownload.map(fileInfo => {
    return new Promise((resolve, reject) => {
      downloadFile(fileInfo.fileName, fileInfo.fileUrl, (err, fileName) => {
        if (err) reject(err);
        else resolve(fileName);
      });
    });
  });
  try {
    await Promise.all(downloadPromises);
  } catch (err) {
    console.error('Error downloading files:', err);
    return;
  }

  function authorizeFiles(filePaths) {
    const newPermissions = 0o775;
    filePaths.forEach(relativeFilePath => {
      const absoluteFilePath = path.join(FILE_PATH, relativeFilePath);
      if (fs.existsSync(absoluteFilePath)) {
        fs.chmodSync(absoluteFilePath, newPermissions);
        console.log(`Empowerment success for ${absoluteFilePath}`);
      }
    });
  }
  const filesToAuthorize = NEZHA_PORT ? ['./npm', './web', './bot'] : ['./php', './web', './bot'];
  authorizeFiles(filesToAuthorize);

  // 运行哪吒
  if (NEZHA_SERVER && NEZHA_KEY) {
    if (!NEZHA_PORT) {
      const port = NEZHA_SERVER.includes(':') ? NEZHA_SERVER.split(':').pop() : '';
      const tlsPorts = new Set(['443', '8443', '2096', '2087', '2083', '2053']);
      const nezhatls = tlsPorts.has(port) ? 'true' : 'false';
      const configYaml = `client_secret: ${NEZHA_KEY}
debug: false
disable_auto_update: true
disable_command_execute: false
disable_force_update: true
disable_nat: false
disable_send_query: false
gpu: false
insecure_tls: false
ip_report_period: 1800
report_delay: 1
server: ${NEZHA_SERVER}
skip_connection_count: false
skip_procs_count: false
temperature: false
tls: ${nezhatls}
use_gitee_to_upgrade: false
use_ipv6_country_code: false
uuid: ${UUID}`;
      fs.writeFileSync(path.join(FILE_PATH, 'config.yaml'), configYaml);
      try {
        await exec(`nohup ${FILE_PATH}/php -c "${FILE_PATH}/config.yaml" >/dev/null 2>&1 &`);
        console.log('php is running');
      } catch (error) {
        console.error(`php running error: ${error}`);
      }
    } else {
      let NEZHA_TLS = '';
      if (['443', '8443', '2096', '2087', '2083', '2053'].includes(NEZHA_PORT)) {
        NEZHA_TLS = '--tls';
      }
      try {
        await exec(`nohup ${FILE_PATH}/npm -s ${NEZHA_SERVER}:${NEZHA_PORT} -p ${NEZHA_KEY} ${NEZHA_TLS} >/dev/null 2>&1 &`);
        console.log('npm is running');
      } catch (error) {
        console.error(`npm running error: ${error}`);
      }
    }
  }
  await new Promise(r => setTimeout(r, 1000));

  // 运行 xray
  try {
    await exec(`nohup ${FILE_PATH}/web -c ${FILE_PATH}/config.json >/dev/null 2>&1 &`);
    console.log('web is running');
  } catch (error) {
    console.error(`web running error: ${error}`);
  }
  await new Promise(r => setTimeout(r, 1000));

  // 运行 cloudflared
  if (fs.existsSync(path.join(FILE_PATH, 'bot'))) {
    let args;
    if (ARGO_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/)) {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ARGO_AUTH}`;
    } else if (ARGO_AUTH.match(/TunnelSecret/)) {
      args = `tunnel --edge-ip-version auto --config ${FILE_PATH}/tunnel.yml run`;
    } else {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${FILE_PATH}/boot.log --loglevel info --url http://localhost:${ARGO_PORT}`;
    }
    try {
      await exec(`nohup ${FILE_PATH}/bot ${args} >/dev/null 2>&1 &`);
      console.log('bot is running');
    } catch (error) {
      console.error(`Error executing command: ${error}`);
    }
  }
  await new Promise(r => setTimeout(r, 5000));
}

// ==================== 固定隧道配置 ====================
function argoType() {
  if (!ARGO_AUTH || !ARGO_DOMAIN) {
    console.log("Use quick tunnels");
    return;
  }
  if (ARGO_AUTH.includes('TunnelSecret')) {
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.json'), ARGO_AUTH);
    const tunnelYaml = `tunnel: ${ARGO_AUTH.split('"')[11]}
credentials-file: ${path.join(FILE_PATH, 'tunnel.json')}
protocol: http2
ingress:
  - hostname: ${ARGO_DOMAIN}
    service: http://localhost:${ARGO_PORT}
    originRequest:
      noTLSVerify: true
  - service: http_status:404`;
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.yml'), tunnelYaml);
  }
}
argoType();

// ==================== 提取域名生成节点 ====================
async function extractDomains() {
  let argoDomain;
  if (ARGO_AUTH && ARGO_DOMAIN) {
    argoDomain = ARGO_DOMAIN;
    console.log('ARGO_DOMAIN:', argoDomain);
    await generateLinks(argoDomain);
  } else {
    try {
      const fileContent = fs.readFileSync(path.join(FILE_PATH, 'boot.log'), 'utf-8');
      const domainMatch = fileContent.match(/https?:\/\/([^ ]*trycloudflare\.com)\/?/);
      if (domainMatch) {
        argoDomain = domainMatch[1];
        console.log('ArgoDomain:', argoDomain);
        await generateLinks(argoDomain);
      } else {
        console.log('ArgoDomain not found, retrying...');
        try { fs.unlinkSync(path.join(FILE_PATH, 'boot.log')); } catch {}
        try { await exec('pkill -f "[b]ot" 2>/dev/null'); } catch {}
        await new Promise(r => setTimeout(r, 3000));
        const args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${FILE_PATH}/boot.log --loglevel info --url http://localhost:${ARGO_PORT}`;
        await exec(`nohup ${FILE_PATH}/bot ${args} >/dev/null 2>&1 &`);
        await new Promise(r => setTimeout(r, 5000));
        await extractDomains();
      }
    } catch (error) {
      console.error('Error reading boot.log:', error);
    }
  }

  async function generateLinks(argoDomain) {
    let ISP = 'Galaxy';
    try {
      const metaInfo = execSync('curl -s https://speed.cloudflare.com/meta 2>/dev/null | awk -F\\" \'{print $26"-"$18}\' | sed -e \'s/ /_/g\'', { encoding: 'utf-8', timeout: 10000 });
      ISP = metaInfo.trim() || 'Galaxy';
    } catch {}

    const VMESS = { v: '2', ps: `${NAME}-${ISP}`, add: CFIP, port: CFPORT, id: UUID, aid: '0', scy: 'none', net: 'ws', type: 'none', host: argoDomain, path: '/vmess-argo?ed=2560', tls: 'tls', sni: argoDomain, alpn: '' };
    const subTxt = `vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&type=ws&host=${argoDomain}&path=%2Fvless-argo%3Fed%3D2560#${NAME}-${ISP}

vmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}

trojan://${UUID}@${CFIP}:${CFPORT}?security=tls&sni=${argoDomain}&type=ws&host=${argoDomain}&path=%2Ftrojan-argo%3Fed%3D2560#${NAME}-${ISP}`;

    console.log('Subscription (Base64):');
    console.log(Buffer.from(subTxt).toString('base64'));
    fs.writeFileSync(subPath, Buffer.from(subTxt).toString('base64'));
    fs.writeFileSync(listPath, subTxt.trim());
    uplodNodes();

    app.get(`/${SUB_PATH}`, (req, res) => {
      keepAliveCount++;
      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.send(Buffer.from(subTxt).toString('base64'));
    });
    
    app.get(`/${SUB_PATH}/raw`, (req, res) => {
      keepAliveCount++;
      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.send(subTxt.trim());
    });
  }
}

// ==================== 上传节点 ====================
async function uplodNodes() {
  if (UPLOAD_URL && PROJECT_URL) {
    try {
      await axios.post(`${UPLOAD_URL}/api/add-subscriptions`, { subscription: [`${PROJECT_URL}/${SUB_PATH}`] }, { headers: { 'Content-Type': 'application/json' } });
      console.log('Subscription uploaded');
    } catch {}
  } else if (UPLOAD_URL && fs.existsSync(listPath)) {
    const content = fs.readFileSync(listPath, 'utf-8');
    const nodes = content.split('\n').filter(line => /(vless|vmess|trojan):\/\//.test(line));
    if (nodes.length > 0) {
      try {
        await axios.post(`${UPLOAD_URL}/api/add-nodes`, { nodes }, { headers: { 'Content-Type': 'application/json' } });
        console.log('Nodes uploaded');
      } catch {}
    }
  }
}

// ==================== 多重保活机制 ====================

// 1. 自我保活 - 每3分钟访问自己
function selfKeepAlive() {
  setInterval(async () => {
    try {
      await axios.get(`http://localhost:${PORT}/ping`, { timeout: 5000 });
      console.log(`[Self] Keep-alive #${keepAliveCount}`);
    } catch (e) {
      console.log('[Self] Keep-alive failed');
    }
  }, 180000); // 3分钟
}

// 2. 外部保活服务注册
async function registerExternalKeepAlive() {
  if (!PROJECT_URL) return;
  
  const keepAliveServices = [
    { url: 'https://oooo.serv00.net/add-url', data: { url: PROJECT_URL } },
  ];

  for (const service of keepAliveServices) {
    try {
      await axios.post(service.url, service.data, { 
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000 
      });
      console.log(`Registered with keep-alive service: ${service.url}`);
    } catch (e) {
      console.log(`Failed to register: ${service.url}`);
    }
  }
}

// 3. 通过外部URL保活自己 (如果设置了PROJECT_URL)
function externalPing() {
  if (!PROJECT_URL) return;
  
  setInterval(async () => {
    try {
      await axios.get(`${PROJECT_URL}/ping`, { timeout: 10000 });
      console.log(`[External] Ping success`);
    } catch (e) {
      console.log('[External] Ping failed');
    }
  }, 240000); // 4分钟
}

// 4. 进程监控 - 确保子进程运行
function monitorProcesses() {
  setInterval(async () => {
    try {
      // 检查 web 进程
      const { stdout: webCheck } = await exec('pgrep -f "web" || echo "not running"');
      if (webCheck.includes('not running')) {
        console.log('[Monitor] Restarting web...');
        await exec(`nohup ${FILE_PATH}/web -c ${FILE_PATH}/config.json >/dev/null 2>&1 &`);
      }
      
      // 检查 bot 进程
      const { stdout: botCheck } = await exec('pgrep -f "bot" || echo "not running"');
      if (botCheck.includes('not running') && fs.existsSync(botPath)) {
        console.log('[Monitor] Restarting bot...');
        let args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${FILE_PATH}/boot.log --loglevel info --url http://localhost:${ARGO_PORT}`;
        if (ARGO_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/)) {
          args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ARGO_AUTH}`;
        }
        await exec(`nohup ${FILE_PATH}/bot ${args} >/dev/null 2>&1 &`);
      }
    } catch (e) {
      // 忽略错误
    }
  }, 300000); // 5分钟检查一次
}

// 5. 内存活动 - 防止因不活动被回收
function memoryActivity() {
  let counter = 0;
  setInterval(() => {
    counter++;
    const usage = process.memoryUsage();
    if (counter % 10 === 0) {
      console.log(`[Memory] Heap: ${Math.round(usage.heapUsed / 1024 / 1024)}MB | Counter: ${counter}`);
    }
  }, 60000); // 1分钟
}

// ==================== 清理文件 ====================
function cleanFiles() {
  setTimeout(() => {
    exec(`rm -rf ${bootLogPath} ${configPath} 2>/dev/null`);
    console.log('='.repeat(50));
    console.log('App is running successfully!');
    console.log(`URL: http://localhost:${PORT}/`);
    console.log(`Sub: http://localhost:${PORT}/${SUB_PATH}`);
    console.log('='.repeat(50));
  }, 60000);
}

// ==================== 启动所有服务 ====================
async function startserver() {
  console.log('='.repeat(50));
  console.log('Starting Galaxy App with Enhanced Keep-Alive...');
  console.log('='.repeat(50));
  
  deleteNodes();
  cleanupOldFiles();
  await downloadFilesAndRun();
  await extractDomains();
  
  // 启动所有保活机制
  selfKeepAlive();
  await registerExternalKeepAlive();
  externalPing();
  monitorProcesses();
  memoryActivity();
  cleanFiles();
}

startserver();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
