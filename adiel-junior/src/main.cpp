// =============================================================================
//  Adiel Junior — AdielJunior.exe
//  נקודת כניסה: ניתוח ארגומנטים, קונפיג, הרצת המנוע כולו.
//  Windows x64 Release — קובץ .exe יחיד, עצמאי, 100% מקומי.
// =============================================================================
#include <cstdio>
#include <cstring>
#include <string>

#include "app/AdielApp.h"
#include "core/Config.h"
#include "core/Logger.h"

#ifdef _WIN32
#include <windows.h>
#pragma comment(linker, "/SUBSYSTEM:WINDOWS /ENTRY:mainCRTStartup")
#if defined(ADIEL_HAVE_OCR) && __has_include(<winrt/base.h>)
#define AJ_USE_WINRT 1
#include <winrt/base.h>
#endif
#endif

// בדיקות עצמיות (קובץ נפרד)
namespace aj { int runSelfTests(); }
// צ'אט קונסולי (קובץ נפרד) — AdielJunior.exe --console
namespace aj { int runConsoleChat(const Config& cfg); }

namespace {

void printUsage() {
    std::fputs(
        "Adiel Junior v1.0 - עוזר אישי חכם, Native C++20, 100% מקומי\n"
        "-------------------------------------------------------------\n"
        "שימוש:\n"
        "  AdielJunior.exe                    הרצה רגילה\n"
        "  AdielJunior.exe --config FILE      קובץ קונפיגורציה מותאם\n"
        "  AdielJunior.exe --demo             מצב הדגמה (ללא מודלים - בדיקת כל הצינור)\n"
        "  AdielJunior.exe --headless         ללא חלון HUD (יומן בלבד)\n"
        "  AdielJunior.exe --selftest         בדיקות עצמיות של הליבה\n"
        "  AdielJunior.exe --version          גרסה\n"
        "  AdielJunior.exe --help             עזרה זו\n", stdout);
}

} // namespace

#ifdef _WIN32
// כשמריצים מ-PowerShell/cmd — מחבר את הפלט לקונסולה של ההורה
static void attachParentConsole() {
    if (AttachConsole(ATTACH_PARENT_PROCESS)) {
        FILE* f = nullptr;
        freopen_s(&f, "CONOUT$", "w", stdout);
        freopen_s(&f, "CONOUT$", "w", stderr);
        freopen_s(&f, "CONIN$", "r", stdin);
    }
}
#endif

int main(int argc, char** argv) {
    using namespace aj;

#ifdef _WIN32
    attachParentConsole();
#endif

    std::string configPath = "config/adieljunior.json";
    bool demo = false, headless = false, console = false, autostart = false;

    for (int i = 1; i < argc; ++i) {
        const std::string a = argv[i];
        if (a == "--help" || a == "-h") { printUsage(); return 0; }
        if (a == "--version") { std::printf("Adiel Junior v1.0.0 (C++20, x64)\n"); return 0; }
        if (a == "--selftest") { return runSelfTests(); }
        if (a == "--demo") demo = true;
        if (a == "--headless") headless = true;
        if (a == "--console") console = true;
        if (a == "--autostart") autostart = true;
        if (a == "--config" && i + 1 < argc) configPath = argv[++i];
    }

    // לוגר
    auto& logger = Logger::instance();
    logger.setMinLevel(LogLevel::Info);
    logger.setFile("logs/adieljunior.log");
    logger.setFileEnabled(true);

    // קונפיג
    std::string err;
    Config cfg = Config::load(configPath, &err);
    if (!err.empty()) {
        logWarn("משתמשים בקונפיג ברירת מחדל (%s)", err.c_str());
        Config::writeDefault(configPath);
        cfg = Config::load(configPath);
    }

    if (demo) {
        logInfo("מצב הדגמה: כל המנועים במצב stub");
        cfg.engine = "stub";
        cfg.sttEngine = "stub";
        cfg.ttsEngine = "stub";
        cfg.wakeEngine = "stub";
        cfg.visionEnabled = false; // ללא DXGI בהדגמה — אין חלון Windows
    }
    if (headless) {
        cfg.hudEnabled = false;
    }

#ifdef _WIN32
    if (autostart) {
        // הפעלה אוטומטית עם Windows (HKCU\...\Run)
        HKEY key = nullptr;
        if (RegOpenKeyExW(HKEY_CURRENT_USER,
                          L"Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                          0, KEY_SET_VALUE, &key) == ERROR_SUCCESS) {
            wchar_t exePath[MAX_PATH] = {0};
            GetModuleFileNameW(nullptr, exePath, MAX_PATH);
            std::wstring cmd = L"\"" + std::wstring(exePath) + L"\"";
            if (RegSetValueExW(key, L"AdielJunior", 0, REG_SZ,
                               reinterpret_cast<const BYTE*>(cmd.c_str()),
                               static_cast<DWORD>((cmd.size() + 1) * sizeof(wchar_t))) == ERROR_SUCCESS) {
                std::printf("Adiel Junior נרשם להפעלה אוטומטית עם Windows.\n");
            }
            RegCloseKey(key);
        }
        return 0;
    }
#endif

    if (console) {
        // מצב קונסול: צ'אט ישיר בטרמינל (ללא HUD) — מצוין לבדיקת המודל
        return runConsoleChat(cfg);
    }
#ifndef _WIN32
    (void)autostart; // שמירה על ניקיון אזהרות בפלטפורמות אחרות
#endif

#ifdef AJ_USE_WINRT
    // אתחול WinRT (לצורך OCR של Windows)
    winrt::init_apartment();
#endif

    AdielApp app(cfg);
    const int rc = app.run();

#ifdef AJ_USE_WINRT
    winrt::uninit_apartment();
#endif
    return rc;
}
