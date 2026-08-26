// 데스크탑 자동 업데이트 체크 및 적용
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * 앱 시작 및 재실행 시 자동으로 새 버전을 확인하고, 업데이트가 있으면 다운로드하여 즉시 재시작합니다.
 */
export async function checkForAppUpdates(): Promise<boolean> {
  try {
    const update = await check();
    if (update) {
      console.log(`새로운 버전 ${update.version}이 발견되었습니다. 자동 업데이트 설치 중...`);
      await update.downloadAndInstall();
      await relaunch();
      return true;
    }
    return false;
  } catch (err) {
    console.warn("업데이트 확인 중 오류 (오프라인 등):", err);
    return false;
  }
}
