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
// 只填写UPLOAD_URL将上传节点,同时填写UPLOAD_URL和PROJECT_URL将上传订阅
const UPLOAD_URL = process.env.UPLOAD_URL || '';      // 节点或订阅自动上传地址
const PROJECT_URL = process.env.PROJECT_URL || '';    // 项目分配的url,用于保活
const AUTO_ACCESS = process.env.AUTO_ACCESS || 'true'; // true开启自动保活
const FILE_PATH = process.env.FILE_PATH || './tmp';   // 运行目录
const SUB_PATH = process.env.SUB_PATH || 'sub';       // 订阅路径
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

// ==================== 创建运行目录 ====================
if (!fs.existsSync(FILE_PATH)) {
  fs.mkdirSync(FILE_PATH, { recursive: true });
  console.log(`${FILE_PATH} is created`);
} else {
  console.log(`${FILE_PATH} already exists`);
}

// 文件路径定义
const npmPath = path.join(FILE_PATH, 'npm');
const phpPath = path.join(FILE_PATH, 'php');
const webPath = path.join(FILE_PATH, 'web');
const botPath = path.join(FILE_PATH, 'bot');
const subPath = path.join(FILE_PATH, 'sub.txt');
const listPath = path.join(FILE_PATH, 'list.txt');
const bootLogPath = path.join(FILE_PATH, 'boot.log');
const configPath = path.join(FILE_PATH, 'config.json');

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
    ).catch((error) => { 
      return null; 
    });
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

// ==================== Express 路由 ====================
// 根路由 - 显示 Hello world!
app.get("/", function(req, res) {
  res.send("Hello world!");
});

// 健康检查路由
app.get("/health", function(req, res) {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

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
    { 
      port: 3001, 
      listen: "127.0.0.1", 
      protocol: "vless", 
      settings: { clients: [{ id: UUID }], decryption: "none" }, 
      streamSettings: { network: "tcp", security: "none" } 
    },
    { 
      port: 3002, 
      listen: "127.0.0.1", 
      protocol: "vless", 
      settings: { clients: [{ id: UUID, level: 0 }], decryption: "none" }, 
      streamSettings: { network: "ws", security: "none", wsSettings: { path: "/vless-argo" } }, 
      sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } 
    },
    { 
      port: 3003, 
      listen: "127.0.0.1", 
      protocol: "vmess", 
      settings: { clients: [{ id: UUID, alterId: 0 }] }, 
      streamSettings: { network: "ws", wsSettings: { path: "/vmess-argo" } }, 
      sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } 
    },
    { 
      port: 3004, 
      listen: "127.0.0.1", 
      protocol: "trojan", 
      settings: { clients: [{ password: UUID }] }, 
      streamSettings: { network: "ws", security: "none", wsSettings: { path: "/trojan-argo" } }, 
      sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } 
    },
  ],
  dns: { servers: ["https+local://8.8.8.8/dns-query"] },
  outbounds: [
    { protocol: "freedom", tag: "direct" }, 
    { protocol: "blackhole", tag: "block" }
  ]
};
fs.writeFileSync(path.join(FILE_PATH, 'config.json'), JSON.stringify(config, null, 2));

// ==================== 系统架构判断 ====================
function getSystemArchitecture() {
  const arch = os.arch();
  if (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') {
    return 'arm';
  } else {
    return 'amd';
  }
}

// ==================== 下载文件 ====================
function downloadFile(fileName, fileUrl, callback) {
  const filePath = path.join(FILE_PATH, fileName);
  const writer = fs.createWriteStream(filePath);

  axios({
    method: 'get',
    url: fileUrl,
    responseType: 'stream',
  })
    .then(response => {
      response.data.pipe(writer);

      writer.on('finish', () => {
        writer.close();
        console.log(`Download ${fileName} successfully`);
        callback(null, fileName);
      });

      writer.on('error', err => {
        fs.unlink(filePath, () => {});
        const errorMessage = `Download ${fileName} failed: ${err.message}`;
        console.error(errorMessage);
        callback(errorMessage);
      });
    })
    .catch(err => {
      const errorMessage = `Download ${fileName} failed: ${err.message}`;
      console.error(errorMessage);
      callback(errorMessage);
    });
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
      const npmUrl = architecture === 'arm' 
        ? "https://arm64.ssss.nyc.mn/agent"
        : "https://amd64.ssss.nyc.mn/agent";
      baseFiles.unshift({ fileName: "npm", fileUrl: npmUrl });
    } else {
      const phpUrl = architecture === 'arm' 
        ? "https://arm64.ssss.nyc.mn/v1" 
        : "https://amd64.ssss.nyc.mn/v1";
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
        if (err) {
          reject(err);
        } else {
          resolve(fileName);
        }
      });
    });
  });

  try {
    await Promise.all(downloadPromises);
  } catch (err) {
    console.error('Error downloading files:', err);
    return;
  }

  // 授权文件
  function authorizeFiles(filePaths) {
    const newPermissions = 0o775;
    filePaths.forEach(relativeFilePath => {
      const absoluteFilePath = path.join(FILE_PATH, relativeFilePath);
      if (fs.existsSync(absoluteFilePath)) {
        fs.chmod(absoluteFilePath, newPermissions, (err) => {
          if (err) {
            console.error(`Empowerment failed for ${absoluteFilePath}: ${err}`);
          } else {
            console.log(`Empowerment success for ${absoluteFilePath}: ${newPermissions.toString(8)}`);
          }
        });
      }
    });
  }
  
  const filesToAuthorize = NEZHA_PORT ? ['./npm', './web', './bot'] : ['./php', './web', './bot'];
  authorizeFiles(filesToAuthorize);

  // 运行哪吒监控
  if (NEZHA_SERVER && NEZHA_KEY) {
    if (!NEZHA_PORT) {
      // 哪吒 v1
      const port = NEZHA_SERVER.includes(':') ? NEZHA_SERVER.split(':').pop() : '';
      const tlsPorts = new Set(['443', '8443', '2096', '2087', '2083', '2053']);
      const nezhatls = tlsPorts.has(port) ? 'true' : 'false';
      
      const configYaml = `
client_secret: ${NEZHA_KEY}
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
      
      const command = `nohup ${FILE_PATH}/php -c "${FILE_PATH}/config.yaml" >/dev/null 2>&1 &`;
      try {
        await exec(command);
        console.log('php is running');
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`php running error: ${error}`);
      }
    } else {
      // 哪吒 v0
      let NEZHA_TLS = '';
      const tlsPorts = ['443', '8443', '2096', '2087', '2083', '2053'];
      if (tlsPorts.includes(NEZHA_PORT)) {
        NEZHA_TLS = '--tls';
      }
      const command = `nohup ${FILE_PATH}/npm -s ${NEZHA_SERVER}:${NEZHA_PORT} -p ${NEZHA_KEY} ${NEZHA_TLS} >/dev/null 2>&1 &`;
      try {
        await exec(command);
        console.log('npm is running');
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`npm running error: ${error}`);
      }
    }
  } else {
    console.log('NEZHA variable is empty, skip running');
  }

  // 运行 xray
  const command1 = `nohup ${FILE_PATH}/web -c ${FILE_PATH}/config.json >/dev/null 2>&1 &`;
  try {
    await exec(command1);
    console.log('web is running');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {
    console.error(`web running error: ${error}`);
  }

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
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Error executing command: ${error}`);
    }
  }
  
  await new Promise((resolve) => setTimeout(resolve, 5000));
}

// ==================== 固定隧道配置 ====================
function argoType() {
  if (!ARGO_AUTH || !ARGO_DOMAIN) {
    console.log("ARGO_DOMAIN or ARGO_AUTH variable is empty, use quick tunnels");
    return;
  }

  if (ARGO_AUTH.includes('TunnelSecret')) {
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.json'), ARGO_AUTH);
    const tunnelYaml = `
tunnel: ${ARGO_AUTH.split('"')[11]}
credentials-file: ${path.join(FILE_PATH, 'tunnel.json')}
protocol: http2

ingress:
  - hostname: ${ARGO_DOMAIN}
    service: http://localhost:${ARGO_PORT}
    originRequest:
      noTLSVerify: true
  - service: http_status:404
`;
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.yml'), tunnelYaml);
  } else {
    console.log("ARGO_AUTH mismatch TunnelSecret, use token connect to tunnel");
  }
}
argoType();

// ==================== 提取隧道域名并生成节点 ====================
async function extractDomains() {
  let argoDomain;

  if (ARGO_AUTH && ARGO_DOMAIN) {
    argoDomain = ARGO_DOMAIN;
    console.log('ARGO_DOMAIN:', argoDomain);
    await generateLinks(argoDomain);
  } else {
    try {
      const fileContent = fs.readFileSync(path.join(FILE_PATH, 'boot.log'), 'utf-8');
      const lines = fileContent.split('\n');
      const argoDomains = [];
      
      lines.forEach((line) => {
        const domainMatch = line.match(/https?:\/\/([^ ]*trycloudflare\.com)\/?/);
        if (domainMatch) {
          const domain = domainMatch[1];
          argoDomains.push(domain);
        }
      });

      if (argoDomains.length > 0) {
        argoDomain = argoDomains[0];
        console.log('ArgoDomain:', argoDomain);
        await generateLinks(argoDomain);
      } else {
        console.log('ArgoDomain not found, re-running bot to obtain ArgoDomain');
        
        // 删除 boot.log 并重新运行
        try {
          fs.unlinkSync(path.join(FILE_PATH, 'boot.log'));
        } catch (e) {}
        
        try {
          await exec('pkill -f "[b]ot" > /dev/null 2>&1');
        } catch (error) {}
        
        await new Promise((resolve) => setTimeout(resolve, 3000));
        
        const args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${FILE_PATH}/boot.log --loglevel info --url http://localhost:${ARGO_PORT}`;
        try {
          await exec(`nohup ${path.join(FILE_PATH, 'bot')} ${args} >/dev/null 2>&1 &`);
          console.log('bot is running.');
          await new Promise((resolve) => setTimeout(resolve, 3000));
          await extractDomains();
        } catch (error) {
          console.error(`Error executing command: ${error}`);
        }
      }
    } catch (error) {
      console.error('Error reading boot.log:', error);
    }
  }

  // 生成节点链接
  async function generateLinks(argoDomain) {
    let ISP = 'Unknown';
    
    try {
      const metaInfo = execSync(
        'curl -s https://speed.cloudflare.com/meta | awk -F\\" \'{print $26"-"$18}\' | sed -e \'s/ /_/g\'',
        { encoding: 'utf-8', timeout: 10000 }
      );
      ISP = metaInfo.trim() || 'Unknown';
    } catch (error) {
      console.log('Failed to get ISP info, using default');
    }

    return new Promise((resolve) => {
      setTimeout(() => {
        const VMESS = { 
          v: '2', 
          ps: `${NAME}-${ISP}`, 
          add: CFIP, 
          port: CFPORT, 
          id: UUID, 
          aid: '0', 
          scy: 'none', 
          net: 'ws', 
          type: 'none', 
          host: argoDomain, 
          path: '/vmess-argo?ed=2560', 
          tls: 'tls', 
          sni: argoDomain, 
          alpn: '' 
        };
        
        const subTxt = `
vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&type=ws&host=${argoDomain}&path=%2Fvless-argo%3Fed%3D2560#${NAME}-${ISP}

vmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}

trojan://${UUID}@${CFIP}:${CFPORT}?security=tls&sni=${argoDomain}&type=ws&host=${argoDomain}&path=%2Ftrojan-argo%3Fed%3D2560#${NAME}-${ISP}
`;
        
        // 打印订阅内容
        console.log('='.repeat(50));
        console.log('Subscription content (Base64):');
        console.log(Buffer.from(subTxt).toString('base64'));
        console.log('='.repeat(50));
        
        // 保存订阅文件
        fs.writeFileSync(subPath, Buffer.from(subTxt).toString('base64'));
        console.log(`${FILE_PATH}/sub.txt saved successfully`);
        
        // 保存明文节点列表
        fs.writeFileSync(listPath, subTxt.trim());
        
        // 上传节点
        uplodNodes();
        
        // 注册订阅路由 - /sub 显示节点信息
        app.get(`/${SUB_PATH}`, (req, res) => {
          const encodedContent = Buffer.from(subTxt).toString('base64');
          res.set('Content-Type', 'text/plain; charset=utf-8');
          res.send(encodedContent);
        });
        
        // 也注册一个明文版本的路由
        app.get(`/${SUB_PATH}/raw`, (req, res) => {
          res.set('Content-Type', 'text/plain; charset=utf-8');
          res.send(subTxt.trim());
        });
        
        resolve(subTxt);
      }, 2000);
    });
  }
}

// ==================== 上传节点或订阅 ====================
async function uplodNodes() {
  if (UPLOAD_URL && PROJECT_URL) {
    const subscriptionUrl = `${PROJECT_URL}/${SUB_PATH}`;
    const jsonData = {
      subscription: [subscriptionUrl]
    };
    try {
      const response = await axios.post(`${UPLOAD_URL}/api/add-subscriptions`, jsonData, {
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.status === 200) {
        console.log('Subscription uploaded successfully');
      }
    } catch (error) {
      if (error.response && error.response.status === 400) {
        console.log('Subscription already exists');
      }
    }
  } else if (UPLOAD_URL) {
    if (!fs.existsSync(listPath)) return;
    
    const content = fs.readFileSync(listPath, 'utf-8');
    const nodes = content.split('\n').filter(line => 
      /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line)
    );

    if (nodes.length === 0) return;

    try {
      const response = await axios.post(`${UPLOAD_URL}/api/add-nodes`, 
        JSON.stringify({ nodes }), 
        { headers: { 'Content-Type': 'application/json' } }
      );
      
      if (response.status === 200) {
        console.log('Nodes uploaded successfully');
      }
    } catch (error) {
      return null;
    }
  }
}

// ==================== 清理文件 (90秒后) ====================
function cleanFiles() {
  setTimeout(() => {
    const filesToDelete = [bootLogPath, configPath];
    
    exec(`rm -rf ${filesToDelete.join(' ')} >/dev/null 2>&1`, (error) => {
      console.clear();
      console.log('='.repeat(50));
      console.log('App is running');
      console.log(`Visit http://localhost:${PORT}/ for Hello World`);
      console.log(`Visit http://localhost:${PORT}/${SUB_PATH} for subscription`);
      console.log('Thank you for using this script, enjoy!');
      console.log('='.repeat(50));
    });
  }, 90000);
}
cleanFiles();

// ==================== 自动保活任务 ====================
async function AddVisitTask() {
  if (AUTO_ACCESS !== 'true' || !PROJECT_URL) {
    console.log("Skipping adding automatic access task");
    return;
  }

  try {
    const response = await axios.post('https://oooo.serv00.net/add-url', {
      url: PROJECT_URL
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    console.log(`Automatic access task added successfully`);
  } catch (error) {
    console.error(`Failed to add auto access task: ${error.message}`);
    
    // 备用保活：自我访问
    setInterval(async () => {
      try {
        await axios.get(`${PROJECT_URL}/health`, { timeout: 5000 });
        console.log('Self keep-alive ping successful');
      } catch (e) {
        console.log('Self keep-alive ping failed');
      }
    }, 280000); // 每4分40秒
  }
}

// ==================== 本地保活定时器 ====================
function startLocalKeepAlive() {
  if (AUTO_ACCESS !== 'true') return;
  
  // 每5分钟自我访问一次
  setInterval(async () => {
    try {
      const response = await axios.get(`http://localhost:${PORT}/health`, { timeout: 5000 });
      console.log(`[${new Date().toISOString()}] Local keep-alive: OK`);
    } catch (error) {
      console.log(`[${new Date().toISOString()}] Local keep-alive: Failed`);
    }
  }, 300000); // 5分钟
}

// ==================== 启动服务 ====================
async function startserver() {
  console.log('='.repeat(50));
  console.log('Starting Galaxy App...');
  console.log('='.repeat(50));
  
  deleteNodes();
  cleanupOldFiles();
  await downloadFilesAndRun();
  await extractDomains();
  await AddVisitTask();
  startLocalKeepAlive();
}

// 启动
startserver();

// ==================== 启动 HTTP 服务器 ====================
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log(`HTTP server is running on port: ${PORT}`);
  console.log(`Main page: http://localhost:${PORT}/`);
  console.log(`Subscription: http://localhost:${PORT}/${SUB_PATH}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log('='.repeat(50));
});
