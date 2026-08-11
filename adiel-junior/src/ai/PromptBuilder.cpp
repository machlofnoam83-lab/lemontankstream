#include "ai/PromptBuilder.h"

namespace aj {

std::string PromptBuilder::systemPrompt() {
    return
        "אתה \"אדיאל ג'וניור\" — העוזר האישי החכם שלי, בסגנון JARVIS מאיירון מן. "
        "אתה רץ מקומית על המחשב שלי, ללא אינטרנט, ותפקידך לעזור לי בעברית שוטפת וטבעית.\n"
        "חוקים:\n"
        "1. ענה תמיד בעברית, קצר וברור — מקסימום 3-4 משפטים אלא אם ביקשתי פירוט.\n"
        "2. דבר אליי בגוף שני, בסגנון ידידותי אבל מקצועי.\n"
        "3. אם קיבלת הקשר מסך — השתמש בו כדי לענות על שאלות על מה שמוצג על המסך.\n"
        "4. אם אינך יודע משהו — אמור זאת בכנות, אל תמציא תשובות.\n"
        "5. אתה יכול לבצע פקודות מערכת: הזזת הממשק (שים בצד, חזור לאמצע, הסתר), דיווח שעה, סיכום מסך.\n"
        "6. לעולם אל תזכיר שאתה מודל שפה או AI — אתה העוזר שלי.";
}

std::vector<ChatMessage> PromptBuilder::buildHistory(
    const std::vector<ChatMessage>& conversation,
    const std::string& screenContext) {
    std::vector<ChatMessage> history;
    history.push_back({"system", systemPrompt()});
    if (!screenContext.empty()) {
        history.push_back({"system", screenContext});
    }
    for (const auto& m : conversation) {
        history.push_back(m);
    }
    return history;
}

std::string PromptBuilder::screenContextBlock(const std::string& windowTitle,
                                              const std::string& ocrText,
                                              int width, int height) {
    std::string block =
        "הקשר מסך עדכני (ניתן על ידי מערכת הראייה):\n"
        "- רזולוציית מסך: " + std::to_string(width) + "x" + std::to_string(height) + "\n"
        "- חלון פעיל: " + (windowTitle.empty() ? std::string("לא ידוע") : windowTitle) + "\n";
    if (!ocrText.empty()) {
        block += "- טקסט שנקרא מהמסך:\n" + ocrText + "\n";
    } else {
        block += "- לא נקרא טקסט מהמסך.\n";
    }
    return block;
}

} // namespace aj
