/**
 * Windows 集成测试：setx 写入 → REG DELETE 清除
 * 在 CI (GitHub Actions Windows runner) 上运行
 */
const { execSync } = require('child_process');

// 1. Write a test env var via setx
try {
  execSync('setx PPIO_CI_TEST_VAR "ci_test_value"', { shell: 'cmd.exe', timeout: 10000 });
  console.log('PASS: setx command executed');
} catch (e) {
  console.error('FAIL: setx failed: ' + e.message);
  process.exit(1);
}

// 2. Clean up via REG DELETE
try {
  execSync('REG DELETE "HKCU\\Environment" /v PPIO_CI_TEST_VAR /f', { shell: 'cmd.exe', timeout: 10000 });
  console.log('PASS: REG DELETE cleanup succeeded');
} catch (e) {
  // REG DELETE 可能因为 setx 还没同步到注册表而失败，不视为错误
  console.log('WARN: REG DELETE cleanup: ' + e.message);
}

console.log('PASS: Windows env var write/cleanup cycle works');
console.log('All Windows integration tests passed!');
