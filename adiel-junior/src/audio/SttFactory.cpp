// =============================================================================
//  Adiel Junior — SttFactory
// =============================================================================
#include "audio/IStt.h"

#include "core/Logger.h"

#ifdef ADIEL_HAVE_WHISPER
#include "audio/WhisperStt.h"
#endif
#include "audio/SttStub.h"

namespace aj {

IStt* createSttEngine(const Config& cfg) {
#ifdef ADIEL_HAVE_WHISPER
    if (cfg.sttEngine == "whisper") {
        auto* stt = new WhisperStt();
        if (stt->init(cfg)) return stt;
        logWarn("STT: whisper לא נטען — עובר למצב הדגמה");
        delete stt;
        return new SttStub();
    }
#endif
    return new SttStub();
}

} // namespace aj
