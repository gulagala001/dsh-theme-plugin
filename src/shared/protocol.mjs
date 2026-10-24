export const PACKAGE = '@gulagala001/dsh-theme-plugin';
export const VERSION = '0.2.2-dsh.0.2.1-rc.3';
export const HOST_VERSION = '0.2.1-rc.3';
export const PROTOCOL = 'dsh-theme-plugin/v1';
export const API = '/api/dsh-theme-plugin';
export const BUILTINS = [
  { id: 'default', name: 'DSH 原生', description: '跟随 DSH 原生外观与组件。', version: HOST_VERSION, native: true },
  { id: 'glyph-motion', name: 'Glyph 动态字符', description: '黑白字符鲸鱼、背景扰动与思考波纹。', version: '1.0.0', dynamic: true },
  { id: 'codex-desktop', name: 'Codex Desktop', description: '黑白强调、冷灰侧栏与悬浮工作台。', version: '1.0.1', image: 'theme-codex-light.jpg', darkImage: 'theme-codex-dark.jpg' },
  { id: 'ios-liquid-glass', name: 'iOS Liquid Glass', description: '圆角玻璃面板、分组设置与悬浮输入区。', version: '1.0.0', image: 'theme-glass-light.jpg', darkImage: 'theme-glass-dark.jpg' },
  { id: 'claude-cli-terminal', name: 'Claude CLI', description: '纸白与暖黑、陶土橙和等宽排版。', version: '1.0.0', image: 'theme-terminal-light.jpg', darkImage: 'theme-terminal-dark.jpg' },
  { id: 'google-material-expressive', name: 'Google Material', description: 'Material 配色、导航、设置与本地字体。', version: '1.0.0', image: 'theme-material-light.jpg', darkImage: 'theme-material-dark.jpg' },
];
export const text = value => typeof value === 'string' ? value : value && typeof value === 'object' ? value.zh || value.en || Object.values(value).find(v => typeof v === 'string') || '' : '';
export const slug = value => String(value || 'theme').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'theme';
export const safeId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_.:-]{0,179}$/.test(value);
export class ThemeError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'ThemeError'; this.code = code; this.details = details; }
}
export function repairTask({ theme = {}, error = {}, hostVersion = HOST_VERSION, report = {} }) {
  return [
    `请修复这个主题与 ${PACKAGE} 的兼容问题，交付可以直接导入的修复包。`,
    '',
    `宿主：DeepSeek Harness ${hostVersion}`,
    `主题基座：${PACKAGE} ${VERSION}；协议：${PROTOCOL}`,
    `主题：${theme.name || theme.id || '未知主题'}；版本：${theme.version || '未声明'}`,
    `来源：${theme.source?.url || theme.repo || theme.source?.spec || '本地导入'}`,
    `固定版本/摘要：${theme.source?.resolved || theme.digest || '见主题原包'}`,
    `检测格式：${report.format || theme.format || '尚未识别'}`,
    `失败阶段：${error.stage || report.stage || '安装预检'}`,
    `错误代码：${error.code || 'compatibility-error'}`,
    `错误说明：${error.message || String(error)}`,
    `兼容报告：${JSON.stringify(report, null, 2)}`,
    '',
    '要求：',
    '1. 先读取原主题、包清单及完整错误，保留原有配色、布局、图片、字体、动态和用户设置；不要用只提取配色冒充完整兼容。',
    '2. 不修改或重启用户的工作 DSH，不覆盖用户数据，不放宽宿主版本或绕过本基座预检。',
    '3. 优先修复原有受支持格式（Skin Center v2、DSH 客户端主题、Dream 配色包或 .omd-skin.json）；也可交付 theme.json 声明式目录包。',
    '4. theme.json: {format:"dsh-theme-plugin/v1",id,name,version,tokens:{light:{},dark:{}},styles:[],assets:[],background:{},settings:[]}。tokens 保留完整 --dsw-* 名称。样式和资源使用包内相对路径；不要嵌入任意安装脚本。',
    '5. 动态客户端需完整声明入口、模块依赖及资源路由，提供可卸载的 apply(ctx)；后端能力不能通过伪造返回值替代。确实缺少必要能力时明确列出，勿绕过检测。',
    '6. 对真实匹配宿主检查加载/切换/卸载/恢复、明暗、菜单、输入区和窄屏；保留来源、作者及素材许可。',
    '7. 最后交付一个修复后的 .zip/.tgz/JSON 文件，附简短变更说明。用户将其导回主题管理重新检查；请勿自行替换正式安装。',
  ].join('\n');
}
