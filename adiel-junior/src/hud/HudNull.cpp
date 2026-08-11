#include "hud/HudNull.h"

#include <chrono>
#include <thread>

#include "core/Logger.h"

namespace aj {

bool HudNull::init(const Config&, ActionCallback) {
    logInfo("HUD: מצב headless (ללא חלון)");
    return true;
}

void HudNull::run() {
    // לולאת חיים עדינה — מחכה לבקשת יציאה
    while (!m_exit.load()) {
        std::this_thread::sleep_for(std::chrono::milliseconds(200));
    }
}

} // namespace aj

#ifndef _WIN32
// מפעל: ללא חלון (headless / Linux)
namespace aj {
IHud* createHud(const Config&, IHud::ActionCallback) {
    return new HudNull();
}
} // namespace aj
#endif
