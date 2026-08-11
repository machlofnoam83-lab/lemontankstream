// =============================================================================
//  Adiel Junior — PorcupineWakeWord (Windows)
//  טעינה דינמית של libpv_porcupine.dll ו-C API.
// =============================================================================
#include "audio/PorcupineWakeWord.h"

// pv_porcupine.h הוא C נייד — כולל אותו תמיד (הטעינה הדינמית היא רק ב-Windows)
#include <pv_porcupine.h>

#include "core/Logger.h"

namespace aj {

// טבלת פונקציות דינמית — בדיוק לפי pv_porcupine.h
struct PorcupineWakeWord::FnTable {
    int32_t (*frame_length)() = nullptr;
    int32_t (*sample_rate)() = nullptr;
    const char* (*version)() = nullptr;
    pv_status_t (*init)(const char*, const char*, const char*, int32_t,
                        const char* const*, const float*, pv_porcupine_t**) = nullptr;
    pv_status_t (*process)(pv_porcupine_t*, const int16_t*, int32_t*) = nullptr;
    void (*delete_)(pv_porcupine_t*) = nullptr;
};

#ifdef _WIN32
namespace {
const char* kDllCandidates[] = {
    "libpv_porcupine.dll",          // לצד ה-exe
    "third_party/porcupine/lib/windows/amd64/libpv_porcupine.dll",
    "models/porcupine/libpv_porcupine.dll",
};
}
#endif

PorcupineWakeWord::PorcupineWakeWord() = default;
PorcupineWakeWord::~PorcupineWakeWord() { 
#ifdef _WIN32
    if (m_fn && m_fn->delete_ && m_handle) m_fn->delete_(static_cast<pv_porcupine_t*>(m_handle));
    if (m_lib) FreeLibrary(m_lib);
#endif
    delete m_fn;
}

bool PorcupineWakeWord::loadLibrary(const std::string& dllPath) {
#ifdef _WIN32
    m_lib = LoadLibraryA(dllPath.c_str());
    if (!m_lib) return false;

    m_fn = new FnTable();
    m_fn->frame_length = reinterpret_cast<int32_t(*)()>(GetProcAddress(m_lib, "pv_porcupine_frame_length"));
    m_fn->sample_rate  = reinterpret_cast<int32_t(*)()>(GetProcAddress(m_lib, "pv_sample_rate"));
    m_fn->version      = reinterpret_cast<const char*(*)()>(GetProcAddress(m_lib, "pv_porcupine_version"));
    m_fn->init         = reinterpret_cast<pv_status_t(*)(const char*, const char*, const char*, int32_t, const char* const*, const float*, pv_porcupine_t**)>(GetProcAddress(m_lib, "pv_porcupine_init"));
    m_fn->process      = reinterpret_cast<pv_status_t(*)(pv_porcupine_t*, const int16_t*, int32_t*)>(GetProcAddress(m_lib, "pv_porcupine_process"));
    m_fn->delete_      = reinterpret_cast<void(*)(pv_porcupine_t*)>(GetProcAddress(m_lib, "pv_porcupine_delete"));

    if (!m_fn->init || !m_fn->process || !m_fn->delete_ || !m_fn->frame_length) {
        logError("Porcupine: DLL לא חוקית — פונקציות חסרות");
        FreeLibrary(m_lib);
        m_lib = nullptr;
        delete m_fn;
        m_fn = nullptr;
        return false;
    }
    return true;
#else
    (void)dllPath;
    return false;
#endif
}

bool PorcupineWakeWord::init(const Config& cfg) {
#ifdef _WIN32
    std::string dll;
#ifdef ADIEL_PORCUPINE_DLL
    dll = ADIEL_PORCUPINE_DLL;
#endif
    if (dll.empty()) {
        for (const char* cand : kDllCandidates) {
            if (loadLibrary(cand)) { dll = cand; break; }
        }
    } else {
        loadLibrary(dll);
    }
    if (!m_lib) {
        logWarn("Porcupine: libpv_porcupine.dll לא נמצאה — עוברים למצב מקש חם");
        return false;
    }
    if (m_fn->version()) logInfo("Porcupine: גרסת %s", m_fn->version());

    m_frameLength = m_fn->frame_length();

    const char* keywordPath = cfg.porcupineKeyword.c_str();
    const char* paramsPath  = cfg.porcupineParams.c_str();
    const float sens = cfg.wakeSensitivity;

    pv_status_t st = m_fn->init("", paramsPath, "cpu", 1, &keywordPath, &sens,
                                reinterpret_cast<pv_porcupine_t**>(&m_handle));
    if (st != PV_STATUS_SUCCESS) {
        logError("Porcupine: init נכשל (קוד %d) — בדקו את קבצי המודל (%s, %s)",
                 static_cast<int>(st), keywordPath, paramsPath);
        return false;
    }
    m_pcmBuf.reserve(static_cast<size_t>(m_frameLength));
    m_ready = true;
    logInfo("Porcupine: פעיל — ממתין ל\"%s\" (frame=%d)", cfg.wakeKeyword.c_str(), m_frameLength);
    return true;
#else
    (void)cfg;
    return false;
#endif
}

void PorcupineWakeWord::feed(const float* samples, size_t count) {
    if (!m_ready || !samples || count == 0) return;

    for (size_t i = 0; i < count; ++i) {
        float v = samples[i];
        if (v > 1.0f) v = 1.0f;
        if (v < -1.0f) v = -1.0f;
        m_pcmBuf.push_back(static_cast<int16_t>(v * 32767.0f));

        // בכל פעם שנצבר מסגרת מלאה — עיבוד
        if (static_cast<int32_t>(m_pcmBuf.size()) >= m_frameLength) {
            if (!m_muted.load()) {
                int32_t keywordIndex = -1;
#ifdef _WIN32
                pv_status_t st = m_fn->process(static_cast<pv_porcupine_t*>(m_handle),
                                               m_pcmBuf.data(), &keywordIndex);
                if (st == PV_STATUS_SUCCESS && keywordIndex >= 0) {
                    logInfo("Porcupine: מילת הפעלה זוהתה!");
                    if (m_onDetected) m_onDetected();
                }
#endif
            }
            m_pcmBuf.clear();
        }
    }
}

} // namespace aj
