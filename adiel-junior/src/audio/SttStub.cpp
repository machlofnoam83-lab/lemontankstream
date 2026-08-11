#include "audio/SttStub.h"

#include "core/Logger.h"

namespace aj {

bool SttStub::init(const Config& cfg) {
    (void)cfg;
    logInfo("SttStub: מצב הדגמה — תמלול מדומה");
    return true;
}

std::string SttStub::transcribe(const float* samples, size_t count) {
    (void)samples;
    if (count == 0) return {};
    // הדגמה: מחזיר פקודה קבועה כדי שניתן יהיה לבדוק את שאר המנוע
    logInfo("SttStub: מתמלל %zu דגימות (מדומה)", count);
    return "מה השעה";
}

} // namespace aj
