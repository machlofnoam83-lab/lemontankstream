// =============================================================================
//  Adiel Junior — LlamaCppEngine
//  מנוע ה-AI המקומי: קישור סטטי ישיר מול ספריית llama.cpp (C API).
// =============================================================================
#pragma once

#include <atomic>
#include <mutex>
#include <string>
#include <vector>

#include "ai/ILlmProvider.h"

// Forward declarations של סוגי llama.cpp — בסקופ גלובלי (כמו ב-llama.h)
struct llama_model;
struct llama_context;
struct llama_vocab;

namespace aj {

class LlamaCppEngine final : public ILlmProvider {
public:
    LlamaCppEngine();
    ~LlamaCppEngine() override;

    bool load(const Config& cfg) override;
    bool loaded() const override;
    std::string name() const override;
    std::string chat(const std::vector<ChatMessage>& history,
                     const std::function<void(const std::string&)>& onToken,
                     std::atomic<bool>& cancel) override;
    void reset() override;
    void unload();

private:
    mutable std::mutex m_mtx;
    llama_model*    m_model = nullptr;
    llama_context*  m_ctx   = nullptr;
    const llama_vocab* m_vocab = nullptr;
    std::string m_template;
    std::atomic<bool> m_loaded{false};
};

} // namespace aj
