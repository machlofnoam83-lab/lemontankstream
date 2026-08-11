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

int main(int argc, char** argv) {
    using namespace aj;

    std::string configPath = "config/adieljunior.json";
    bool demo = false, headless = false;

    for (int i = 1; i < argc; ++i) {
        const std::string a = argv[i];
        if (a == "--help" || a == "-h") { printUsage(); return 0; }
        if (a == "--version") { std::printf("Adiel Junior v1.0.0 (C++20, x64)\n"); return 0; }
        if (a == "--selftest") { return runSelfTests(); }
        if (a == "--demo") demo = true;
        if (a == "--headless") headless = true;
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
