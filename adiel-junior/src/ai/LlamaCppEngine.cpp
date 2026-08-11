// =============================================================================
//  Adiel Junior — LlamaCppEngine
//  מנוע ה-AI המקומי: קישור סטטי ישיר מול ספריית llama.cpp (C API).
//
//  - טעינת GGUF (Q4_K_M / Q8_0) מלאה ל-VRAM: gpu_layers = -1 (כל השכבות)
//  - הפעלת תבנית צ'אט מקורית של המודל (llama_chat_apply_template)
//  - סטרימינג טוקן-אחר-טוקן עם שרשראות דגימה (temp / top-p / min-p)
//  - בדיקת סיום EOG (End Of Generation)
// =============================================================================
#include "ai/LlamaCppEngine.h"

#include "core/Logger.h"

#ifdef ADIEL_HAVE_LLAMA

#include <llama.h>

#include <cstring>
#include <thread>
#include <vector>

namespace aj {

// ---------------------------------------------------------------------------
//  פונקציות עזר
// ---------------------------------------------------------------------------
namespace {

// בדיקה האם מחרוזת היא UTF-8 תקין (חותך באמצע תו = לא תקין)
bool validUtf8(const std::string& s) {
    size_t i = 0;
    while (i < s.size()) {
        unsigned char c = static_cast<unsigned char>(s[i]);
        if (c < 0x80) { ++i; continue; }
        int extra = 0;
        if ((c & 0xE0) == 0xC0) extra = 1;
        else if ((c & 0xF0) == 0xE0) extra = 2;
        else if ((c & 0xF8) == 0xF0) extra = 3;
        else return false;
        if (i + extra >= s.size()) return false;
        for (int k = 1; k <= extra; ++k) {
            if ((static_cast<unsigned char>(s[i + k]) & 0xC0) != 0x80) return false;
        }
        i += extra + 1;
    }
    return true;
}

// קריאת תבנית הצ'אט של המודל מהמטא-דאטה של ה-GGUF
std::string modelChatTemplate(const llama_model* model) {
    char buf[4096];
    int n = llama_model_meta_val_str(model, "tokenizer.chat_template", buf, sizeof(buf));
    if (n > 0 && n < static_cast<int>(sizeof(buf))) return std::string(buf, static_cast<size_t>(n));
    return ""; // אין תבנית מובנית — נשתמש ב-chatml
}

void llamaLogCallback(ggml_log_level level, const char* text, void* /*user_data*/) {
    // מעביר לוגים של llama.cpp לתוך הלוגר שלנו (מסנן רעש)
    if (!text) return;
    if (level == GGML_LOG_LEVEL_ERROR) logError("llama: %s", text);
    else if (level == GGML_LOG_LEVEL_WARN) logWarn("llama: %s", text);
    else logDebug("llama: %s", text);
}

} // namespace

// ---------------------------------------------------------------------------
//  מימוש
// ---------------------------------------------------------------------------
LlamaCppEngine::LlamaCppEngine() = default;
LlamaCppEngine::~LlamaCppEngine() { unload(); }

bool LlamaCppEngine::load(const Config& cfg) {
    std::lock_guard<std::mutex> lock(m_mtx);
    if (m_model) return true; // כבר טעון

    logInfo("llama: טוען מודל %s ...", cfg.modelPath.c_str());

    llama_log_set(llamaLogCallback, nullptr);

    llama_model_params mparams = llama_model_default_params();
    mparams.n_gpu_layers = cfg.gpuLayers;   // שלילי = כל השכבות ל-VRAM
    // מצב טעינה: mmap / mlock / שניהם (API עדכני של llama.cpp)
    mparams.load_mode = (cfg.useMmap && cfg.useMlock) ? LLAMA_LOAD_MODE_MMAP_MLOCK
                      : cfg.useMlock             ? LLAMA_LOAD_MODE_MLOCK
                      : cfg.useMmap              ? LLAMA_LOAD_MODE_MMAP
                                                 : LLAMA_LOAD_MODE_NONE;

    m_model = llama_model_load_from_file(cfg.modelPath.c_str(), mparams);
    if (!m_model) {
        logError("llama: כשל בטעינת המודל: %s", cfg.modelPath.c_str());
        return false;
    }

    llama_context_params cparams = llama_context_default_params();
    cparams.n_ctx        = static_cast<uint32_t>(cfg.nCtx > 0 ? cfg.nCtx : 4096);
    cparams.n_batch      = std::min<uint32_t>(cparams.n_ctx, 512);
    cparams.n_threads    = cfg.nThreads > 0 ? cfg.nThreads : std::thread::hardware_concurrency();
    cparams.n_threads_batch = cparams.n_threads;

    m_ctx = llama_init_from_model(m_model, cparams);
    if (!m_ctx) {
        logError("llama: כשל ביצירת context");
        llama_model_free(m_model);
        m_model = nullptr;
        return false;
    }

    m_vocab = llama_model_get_vocab(m_model);
    m_template = modelChatTemplate(m_model);
    m_loaded = true;

    // דוח מערכת
    char arch[128] = {0}, name[256] = {0};
    llama_model_meta_val_str(m_model, "general.architecture", arch, sizeof(arch));
    llama_model_meta_val_str(m_model, "general.name", name, sizeof(name));
    logInfo("llama: מודל נטען — %s (%s), ctx=%u, vocab=%d, gpu_layers=%d",
            name[0] ? name : "unnamed", arch[0] ? arch : "?",
            llama_n_ctx(m_ctx), llama_vocab_n_tokens(m_vocab), cfg.gpuLayers);
    return true;
}

bool LlamaCppEngine::loaded() const {
    return m_loaded.load();
}

std::string LlamaCppEngine::name() const {
    std::lock_guard<std::mutex> lock(m_mtx);
    if (!m_model) return "llama.cpp (לא טעון)";
    char name[256] = {0};
    llama_model_meta_val_str(m_model, "general.name", name, sizeof(name));
    return std::string(name[0] ? name : "llama.cpp");
}

void LlamaCppEngine::unload() {
    std::lock_guard<std::mutex> lock(m_mtx);
    if (m_ctx) { llama_free(m_ctx); m_ctx = nullptr; }
    if (m_model) { llama_model_free(m_model); m_model = nullptr; }
    m_vocab = nullptr;
    m_loaded = false;
    m_template.clear();
}

std::string LlamaCppEngine::chat(const std::vector<ChatMessage>& history,
                                 const std::function<void(const std::string&)>& onToken,
                                 std::atomic<bool>& cancel) {
    std::lock_guard<std::mutex> lock(m_mtx);
    if (!m_loaded || !m_model || !m_ctx) {
        logError("llama: ניסיון שיחה ללא מודל טעון");
        return "המודל לא טעון.";
    }

    // ניקוי זיכרון הרצף — כל שיחה מתחילה מ-KV ריק (נכון ויציב)
    llama_memory_seq_rm(llama_get_memory(m_ctx), 0, -1, -1);

    // ---- 1. בניית prompt לפי תבנית הצ'אט של המודל
    std::vector<llama_chat_message> msgs;
    msgs.reserve(history.size());
    std::vector<std::string> owned; // שמירת הזיכרון של המחרוזות
    for (const auto& m : history) {
        owned.push_back(m.role);
        owned.push_back(m.content);
        msgs.push_back({owned[owned.size() - 2].c_str(), owned[owned.size() - 1].c_str()});
    }

    const char* tmpl = m_template.empty() ? "chatml" : m_template.c_str();
    int len = llama_chat_apply_template(tmpl, msgs.data(), msgs.size(), true, nullptr, 0);
    if (len <= 0) {
        logError("llama: כשל ביישום תבנית צ'אט");
        return "שגיאה פנימית.";
    }
    std::string prompt(static_cast<size_t>(len) + 1, '\0');
    llama_chat_apply_template(tmpl, msgs.data(), msgs.size(), true, prompt.data(), len + 1);
    prompt.resize(static_cast<size_t>(len));

    // ---- 2. טוקניזציה
    std::vector<llama_token> tokens(static_cast<size_t>(llama_vocab_n_tokens(m_vocab)));
    int n_tok = llama_tokenize(m_vocab, prompt.c_str(), static_cast<int32_t>(prompt.size()),
                               tokens.data(), static_cast<int32_t>(tokens.size()), true, true);
    if (n_tok < 0) {
        logError("llama: כשל בטוקניזציה");
        return "שגיאה פנימית.";
    }
    tokens.resize(static_cast<size_t>(n_tok));
    logDebug("llama: prompt=%zu תווים, %zu טוקנים", prompt.size(), tokens.size());

    // ---- 3. שרשרת דגימה
    llama_sampler* smpl = llama_sampler_chain_init(llama_sampler_chain_default_params());
    llama_sampler_chain_add(smpl, llama_sampler_init_min_p(0.05f, 1));
    llama_sampler_chain_add(smpl, llama_sampler_init_top_p(0.9f, 1));
    llama_sampler_chain_add(smpl, llama_sampler_init_temp(0.7f));

    // ---- 4. לולאת ניבוי
    std::string response;
    std::string pending; // חוצץ UTF-8 לטוקנים חלקיים
    const int maxTokens = 512;

    for (int step = 0; step < maxTokens; ++step) {
        if (cancel.load()) {
            logInfo("llama: בוטל ע\"י המשתמש");
            break;
        }

        llama_batch batch = llama_batch_get_one(tokens.data(), static_cast<int32_t>(tokens.size()));
        if (llama_decode(m_ctx, batch) != 0) {
            logError("llama: שגיאת decode");
            break;
        }
        tokens.clear();

        const llama_token id = llama_sampler_sample(smpl, m_ctx, -1);
        if (llama_vocab_is_eog(m_vocab, id)) {
            break; // סיום דור
        }

        // טוקן → טקסט (טיפול נכון ב-UTF-8 רב-בייתי)
        char piece[64];
        int n = llama_token_to_piece(m_vocab, id, piece, sizeof(piece), 0, false);
        if (n > 0) {
            pending.append(piece, static_cast<size_t>(n));
            if (validUtf8(pending)) {
                response += pending;
                if (onToken) onToken(pending);
                pending.clear();
            }
        }
        tokens.push_back(id);
    }

    llama_sampler_free(smpl);
    if (!pending.empty()) response += pending; // שאריות
    logInfo("llama: תשובה הושלמה (%zu תווים)", response.size());
    return response;
}

void LlamaCppEngine::reset() {
    std::lock_guard<std::mutex> lock(m_mtx);
    if (m_ctx) {
        // איפוס KV cache (זיכרון הרצף) לשיחה חדשה — API עדכני
        llama_memory_seq_rm(llama_get_memory(m_ctx), 0, -1, -1);
    }
    logInfo("llama: שיחה אופסה");
}

} // namespace aj

#else // !ADIEL_HAVE_LLAMA

// גרסת fallback אם נבנה ללא llama.cpp (למשל Linux dev build)
namespace aj {
bool LlamaCppEngine::load(const Config&) { return false; }
bool LlamaCppEngine::loaded() const { return false; }
std::string LlamaCppEngine::name() const { return "llama.cpp (לא זמין בבנייה זו)"; }
void LlamaCppEngine::unload() {}
std::string LlamaCppEngine::chat(const std::vector<ChatMessage>&, const std::function<void(const std::string&)>&, std::atomic<bool>&) { return ""; }
void LlamaCppEngine::reset() {}
} // namespace aj

#endif // ADIEL_HAVE_LLAMA
