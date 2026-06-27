use tauri::{Emitter, Manager};
use device_query::{DeviceQuery, DeviceState, Keycode};

#[tauri::command]
fn hide_window(app_handle: tauri::AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.hide();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();

            std::thread::spawn(move || {
                let device_state = DeviceState::new();
                let mut prev_buttons: Vec<bool> = vec![];
                let mut prev_keys: Vec<Keycode> = vec![];

                println!("[Pointer] 🚀 Input polling thread started.");

                loop {
                    let keys = device_state.get_keys();
                    let mouse = device_state.get_mouse();

                    // Debug: print key events
                    for key in &keys {
                        if !prev_keys.contains(key) {
                            println!("[Pointer] 🔑 Key DOWN: {:?}", key);
                        }
                    }

                    // macOS Option key maps to LOption/ROption in device_query v2
                    // Linux Alt key maps to LAlt/RAlt
                    let alt_held = keys.contains(&Keycode::LAlt)
                        || keys.contains(&Keycode::RAlt)
                        || keys.contains(&Keycode::LOption)
                        || keys.contains(&Keycode::ROption);

                    // device_query v2: button_pressed index 1 = left button
                    let left_pressed = mouse.button_pressed.get(1).copied().unwrap_or(false);
                    let prev_left   = prev_buttons.get(1).copied().unwrap_or(false);

                    // Leading edge only
                    if alt_held && left_pressed && !prev_left {
                        let x = mouse.coords.0 as f64;
                        let y = mouse.coords.1 as f64;
                        println!("[Pointer] ✅ Alt+Click at ({}, {}), showing window...", x, y);

                        // Clone handle for the closure
                        let h2 = handle.clone();
                        let h3 = handle.clone();

                        // run_on_main_thread is safe from a regular polling thread
                        // Use LogicalPosition — device_query returns logical coords on macOS
                        let result = handle.run_on_main_thread(move || {
                            if let Some(window) = h2.get_webview_window("main") {
                                let _ = window.set_position(tauri::Position::Logical(
                                    tauri::LogicalPosition::new(x, y)
                                ));
                                let _ = window.show();
                                let _ = window.set_focus();
                                println!("[Pointer] 🪟 Window shown and focused.");
                            } else {
                                println!("[Pointer] ❌ Could not find main window.");
                            }
                        });
                        println!("[Pointer] 🧵 run_on_main_thread result: {:?}", result);

                        // Also emit event so React can focus the input field
                        let _ = h3.emit("pointer-activated", ());
                    }

                    prev_buttons = mouse.button_pressed.clone();
                    prev_keys = keys;

                    std::thread::sleep(std::time::Duration::from_millis(16));
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![hide_window])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
