#include "audio/WakeWordStub.h"

#include "core/Logger.h"

namespace aj {

bool WakeWordStub::init(const Config& cfg) {
    m_keyword = cfg.wakeKeyword;
    logInfo("WakeWordStub: הפעלה דרך מקש חם (Ctrl+Alt+Space) או פקודה");
    return true;
}

void WakeWordStub::trigger() {
    if (m_muted.load()) return;
    logInfo("WakeWordStub: הופעל \"%s\"", m_keyword.c_str());
    if (m_onDetected) m_onDetected();
}

} // namespace aj
