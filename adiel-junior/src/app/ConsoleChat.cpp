// =============================================================================
//  Adiel Junior — ConsoleChat (AdielJunior.exe --console)
//  מצב קונסול: צ'אט ישיר בטרמינל עם המודל — מצוין לבדיקת ה-AI בלי HUD.
//  כולל זיכרון מתמשך (data/history.json) ואיסוף נתונים (data/raw).
// =============================================================================
#include <atomic>
#include <chrono>
#include <cstdio>
#include <iostream>
#include <filesystem>
#include <string>
#include <thread>
#include <vector>

#include "ai/ILlmProvider.h"
#include "ai/PromptBuilder.h"
#include "core/Config.h"
#include "core/Json.h"
#include "core/Logger.h"

namespace aj {

namespace {

std::string historyPath(const Config& cfg) {
    return cfg.historyFile.empty() ? "data/history.json" : cfg.historyFile;
}
std::string rawDir(const Config& cfg) {
    return cfg.rawDataDir.empty() ? "data/raw" : cfg.rawDataDir;
}

// טעינת היסטוריה מקובץ JSON (זיכרון מתמשך)
std::vector<ChatMessage> loadHistory(const Config& cfg) {
    std::vector<ChatMessage> hist;
    json::Value root = json::parseFile(historyPath(cfg));
    const json::Value* arr = root.getArray("messages");
    if (!arr) return hist;
    for (const auto& m : arr->array()) {
        ChatMessage msg;
        msg.role = m.getString("role");
        msg.content = m.getString("content");
        if (!msg.role.empty() && !msg.content.empty()) hist.push_back(std::move(msg));
    }
    if (!hist.empty()) {
        logInfo("זיכרון: נטענו %zu הודעות מהשיחה הקודמת", hist.size());
        std::printf("[זיכרון] נטענו %zu הודעות מהשיחה הקודמת.\n", hist.size());
    }
    return hist;
}

// שמירת היסטוריה (כל שינוי — נשמר מיד)
void saveHistory(const Config& cfg, const std::vector<ChatMessage>& hist) {
    json::Value root;
    json::Value arr;
    for (const auto& m : hist) {
        json::Value jm;
        jm["role"] = json::Value(m.role);
        jm["content"] = json::Value(m.content);
        arr.push(jm);
    }
    root["messages"] = arr;
    json::writeFile(historyPath(cfg), root, true);
}

// איסוף נתונים לקורפוס האימון שלנו (פורמט U:/A: — מזין את build_corpus)
void collectToRaw(const Config& cfg, const std::string& user, const std::string& assistant) {
    if (!cfg.dataCollection) return;
    try {
        std::filesystem::path dir(rawDir(cfg));
        std::filesystem::create_directories(dir);
        std::filesystem::path file = dir / "conversations.txt";
        std::FILE* f = std::fopen(file.string().c_str(), "ab");
        if (!f) return;
        std::fprintf(f, "U: %s\nA: %s\n\n", user.c_str(), assistant.c_str());
        std::fclose(f);
    } catch (...) {}
}

} // namespace

int runConsoleChat(const Config& cfg) {
    logInfo("=== אדיאל ג'וניור — מצב קונסול ===");
    std::printf("=== אדיאל ג'וניור — מצב קונסול ===\n");
    std::printf("כתבו הודעה בעברית, 'exit' לסיום, 'clear' לניקוי שיחה.\n\n");

    ILlmProvider* llm = createLlmProvider(cfg);
    if (!llm || !llm->load(cfg)) {
        std::printf("[!!] לא ניתן לטעון את מנוע ה-AI.\n");
        delete llm;
        return 1;
    }
    std::printf("מנוע: %s\n", llm->name().c_str());

    std::vector<ChatMessage> history = loadHistory(cfg);

    std::string line;
    while (true) {
        std::printf("\nאתה> ");
        std::fflush(stdout);
        if (!std::getline(std::cin, line)) break;
        if (line == "exit" || line == "quit" || line == "יציאה") break;
        if (line == "clear" || line == "נקה") {
            history.clear();
            saveHistory(cfg, history);
            llm->reset();
            std::printf("אדיאל> השיחה נוקתה.\n");
            continue;
        }
        if (line.empty()) continue;

        history.push_back({"user", line});

        std::atomic<bool> cancel{false};
        std::string reply;
        std::printf("אדיאל> ");
        std::fflush(stdout);

        const auto t0 = std::chrono::steady_clock::now();
        std::string full;
        reply = llm->chat(PromptBuilder::buildHistory(history, ""),
                          [&](const std::string& piece) {
                              full += piece;
                              std::printf("%s", piece.c_str());
                              std::fflush(stdout);
                          },
                          cancel);
        const auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                            std::chrono::steady_clock::now() - t0).count();
        std::printf("\n[%lldms]\n", static_cast<long long>(ms));

        if (reply.empty()) reply = full;
        if (reply.empty()) reply = "(ללא תשובה)";
        history.push_back({"assistant", reply});

        // הגבלת היסטוריה
        while (history.size() > static_cast<size_t>(cfg.historyLimit * 2)) {
            history.erase(history.begin(), history.begin() + 2);
        }
        saveHistory(cfg, history);
        collectToRaw(cfg, line, reply);
    }

    saveHistory(cfg, history);
    delete llm;
    return 0;
}

} // namespace aj
