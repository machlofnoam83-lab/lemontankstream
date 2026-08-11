// =============================================================================
//  Adiel Junior — LlmFactory
//  מפעל יצירת ספק ה-AI לפי הגדרת הקונפיג.
// =============================================================================
#include "ai/ILlmProvider.h"

#include "core/Logger.h"

#ifdef ADIEL_HAVE_LLAMA
#include "ai/LlamaCppEngine.h"
#endif
#include "ai/StubLlm.h"

namespace aj {

ILlmProvider* createLlmProvider(const Config& cfg) {
#ifdef ADIEL_HAVE_LLAMA
    if (cfg.engine == "llama") {
        logInfo("AI: בחירת מנוע llama.cpp (GGUF 3B)");
        return new LlamaCppEngine();
    }
#endif
    if (cfg.engine == "stub" || cfg.engine == "demo") {
        logInfo("AI: בחירת מנוע הדגמה (StubLlm)");
        return new StubLlm();
    }
#ifndef ADIEL_HAVE_LLAMA
    logWarn("AI: מנוע llama.cpp לא זמין בבנייה זו — עובר למצב הדגמה");
    return new StubLlm();
#else
    logWarn("AI: מנוע לא מוכר \"%s\" — עובר למצב הדגמה", cfg.engine.c_str());
    return new StubLlm();
#endif
}

} // namespace aj
