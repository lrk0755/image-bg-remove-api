const fs = require('fs');
const path = require('path');

const statsFile = path.join(__dirname, '..', 'config', 'stats.json');

// 初始化统计数据
function initStats() {
  if (!fs.existsSync(statsFile)) {
    const initialStats = {
      totalRequests: 0,
      apiModeCount: 0,
      cloudflareModeCount: 0,
      localModeCount: 0,
      totalProcessTime: 0,
      lastReset: new Date().toISOString()
    };
    fs.writeFileSync(statsFile, JSON.stringify(initialStats, null, 2));
    return initialStats;
  }
  return JSON.parse(fs.readFileSync(statsFile, 'utf-8'));
}

// 更新统计
function updateStats(mode, processTime) {
  const stats = initStats();
  stats.totalRequests++;
  stats.totalProcessTime += processTime;
  
  if (mode === 'api') stats.apiModeCount++;
  else if (mode === 'cloudflare') stats.cloudflareModeCount++;
  else if (mode === 'local') stats.localModeCount++;
  
  fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
  return stats;
}

// 获取统计
function getStats() {
  const stats = initStats();
  stats.averageProcessTime = stats.totalRequests > 0 
    ? (stats.totalProcessTime / stats.totalRequests / 1000).toFixed(2) 
    : 0;
  return stats;
}

// 重置统计
function resetStats() {
  const stats = initStats();
  stats.totalRequests = 0;
  stats.apiModeCount = 0;
  stats.cloudflareModeCount = 0;
  stats.localModeCount = 0;
  stats.totalProcessTime = 0;
  stats.lastReset = new Date().toISOString();
  fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
  return stats;
}

module.exports = {
  updateStats,
  getStats,
  resetStats,
  initStats
};
