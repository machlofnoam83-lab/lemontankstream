// =============================================================================
//  Adiel Junior — PromptBuilder
//  בונה את מערכת-ההנחיות בעברית + הזרקת הקשר מסך לשיחה.
// =============================================================================
#pragma once

#include <string>
#include <vector>

#include "ai/ILlmProvider.h"

namespace aj {

class PromptBuilder {
public:
    // אישיות המערכת (עברית טבעית, סגנון JARVIS)
    static std::string systemPrompt();

    // בונה היסטוריה: מערכת + הודעות + (אופציונלי) הקשר מסך כהודעת מערכת אחרונה
    static std::vector<ChatMessage> buildHistory(
        const std::vector<ChatMessage>& conversation,
        const std::string& screenContext);

    // תיאור קצר של הקשר המסך (כותרת חלון + טקסט OCR) בפורמט עברית
    static std::string screenContextBlock(const std::string& windowTitle,
                                          const std::string& ocrText,
                                          int width, int height);
};

} // namespace aj
