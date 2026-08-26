#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, LogicalSize, Manager, Size, WebviewWindow,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
use tauri_plugin_opener::OpenerExt;

const TRAY_ID: &str = "edu-dic-tray";
const WEB_URL: &str = "https://dic.dgedu.link";
const DEFAULT_SHORTCUT: &str = "Ctrl+Alt+D";

struct AppState {
    always_on_top: Mutex<bool>,
}

#[tauri::command]
fn resize_window(window: WebviewWindow, height: f64) -> Result<(), String> {
    window
        .set_size(Size::Logical(LogicalSize {
            width: 500.0,
            height,
        }))
        .map_err(|e| e.to_string())?;
    Ok(())
}







#[tauri::command]
fn toggle_spotlight(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
    Ok(())
}

fn show_and_focus(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_and_focus(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .manage(AppState {
            always_on_top: Mutex::new(true),
        })
        .setup(|app| {
            // 메인 윈도우 설정
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_always_on_top(true);
                let _ = window.center();
            }

            // 시스템 트레이 메뉴 구성 (맨 상단에 현재 앱 버전 표시)
            let version_label = format!("어린이 쉬운 사전 v{}", app.package_info().version);
            let item_version = MenuItem::with_id(app, "version", &version_label, false, None::<&str>)?;
            let item_show = MenuItem::with_id(app, "show", "사전 열기 (Ctrl+Alt+D)", true, None::<&str>)?;
            let item_web = MenuItem::with_id(app, "web", "웹 사전 열기 (dic.dgedu.link)", true, None::<&str>)?;
            let item_quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;

            let tray_menu = Menu::with_items(app, &[&item_version, &item_show, &item_web, &item_quit])?;


            TrayIconBuilder::with_id(TRAY_ID)
                .menu(&tray_menu)
                .tooltip("어린이 쉬운 사전 데스크탑")
                .show_menu_on_left_click(false)
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => std::process::exit(0),
                    "show" => show_and_focus(app),
                    "web" => {
                        let _ = app.opener().open_url(WEB_URL, None::<&str>);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let visible = window.is_visible().unwrap_or(false);
                            if visible {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // 전역 단축키 등록 (Ctrl+Shift+D)
            let shortcut_app = app.handle().clone();
            let shortcut: Shortcut = DEFAULT_SHORTCUT.parse().expect("단축키 형식 오류");
            let _ = app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(move |_app, s, event| {
                        if s == &shortcut && event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                            if let Some(window) = shortcut_app.get_webview_window("main") {
                                let visible = window.is_visible().unwrap_or(false);
                                if visible {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                    })
                    .build(),
            );

            let _ = app.global_shortcut().register(shortcut);

            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                if window.label() == "main" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![resize_window, toggle_spotlight])
        .run(tauri::generate_context!())
        .expect("어린이 쉬운 사전 데스크탑 실행 중 오류가 발생했습니다.");
}
