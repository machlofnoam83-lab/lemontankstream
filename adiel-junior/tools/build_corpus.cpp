// =============================================================================
//  Adiel Junior - build_corpus (הכלי שלנו לבניית קורפוס האימון)
//  C++ טהור, ללא תלות חיצונית.
//
//  קלט:   קבצי טקסט גולמיים בפורמט:
//           U: שאלת/פקודת המשתמש בעברית
//           A: התשובה של אדיאל ג'וניור בעברית
//         (שורות U ו-A מתחלפות; כל זוג = דוגמת אימון אחת)
//
//  פלט:   קורפוס בפורמט ChatML (מוכן ל-llama-finetune) + סטטיסטיקות
//
//  שימוש: build_corpus -i raw\chat1.txt -i raw\chat2.txt -o data\hebrew_corpus.txt
//         build_corpus -d raw -o data\hebrew_corpus.txt   (כל ה-.txt בתיקייה)
// =============================================================================
#include <algorithm>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <string>
#include <vector>

namespace fs = std::filesystem;

namespace {

struct Stats {
    size_t pairs = 0;
    size_t userChars = 0;
    size_t assistantChars = 0;
    size_t files = 0;
};

std::string trim(const std::string& s) {
    size_t a = 0, b = s.size();
    while (a < b && (s[a] == ' ' || s[a] == '\t' || s[a] == '\r' || s[a] == '\n')) ++a;
    while (b > a && (s[b-1] == ' ' || s[b-1] == '\t' || s[b-1] == '\r' || s[b-1] == '\n')) --b;
    return s.substr(a, b - a);
}

// קורא קובץ אחד ומחלץ זוגות U/A
void processFile(const fs::path& path, std::ofstream& out, Stats& st) {
    std::ifstream in(path, std::ios::binary);
    if (!in) return;
    std::string data((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());

    // המרת קידוד: UTF-8 עם BOM - הסרת BOM
    if (data.size() >= 3 && static_cast<unsigned char>(data[0]) == 0xEF &&
        static_cast<unsigned char>(data[1]) == 0xBB &&
        static_cast<unsigned char>(data[2]) == 0xBF) {
        std::memmove(data.data(), data.data() + 3, data.size() - 3);
        data.resize(data.size() - 3);
    }

    std::vector<std::string> lines;
    size_t pos = 0;
    while (pos < data.size()) {
        size_t nl = data.find('\n', pos);
        std::string line = (nl == std::string::npos) ? data.substr(pos) : data.substr(pos, nl - pos);
        lines.push_back(trim(line));
        if (nl == std::string::npos) break;
        pos = nl + 1;
    }

    std::string pendingUser;
    size_t pairs = 0;
    for (const auto& line : lines) {
        if (line.size() < 3) continue;
        if (line[0] == 'U' && line[1] == ':') {
            pendingUser = trim(line.substr(2));
        } else if (line[0] == 'A' && line[1] == ':' && !pendingUser.empty()) {
            const std::string answer = trim(line.substr(2));
            if (pendingUser.empty() || answer.empty()) { pendingUser.clear(); continue; }

            out << "<|im_start|>system\n"
                << "אתה \"אדיאל ג'וניור\" - העוזר האישי החכם שלי, בסגנון JARVIS. ענה בעברית קצרה וברורה.<|im_end|>\n"
                << "<|im_start|>user\n" << pendingUser << "<|im_end|>\n"
                << "<|im_start|>assistant\n" << answer << "<|im_end|>\n\n";

            st.userChars += pendingUser.size();
            st.assistantChars += answer.size();
            ++st.pairs;
            ++pairs;
            pendingUser.clear();
        }
    }
    st.files += 1;
    std::printf("  [%s] %zu דוגמאות\n", path.filename().string().c_str(), pairs);
}

void usage() {
    std::printf(
        "Adiel Junior - build_corpus (כלי בניית קורפוס האימון שלנו)\n"
        "שימוש:\n"
        "  build_corpus -i FILE... -o OUT    קבצי קלט מרובים\n"
        "  build_corpus -d DIR -o OUT        כל קבצי ה-.txt בתיקייה\n"
        "פורמט קלט (UTF-8):\n"
        "  U: שאלת המשתמש\n"
        "  A: תשובת אדיאל ג'וניור\n");
}

} // namespace

int main(int argc, char** argv) {
    std::vector<std::string> inputs;
    std::string dir, out = "data/hebrew_corpus.txt";

    for (int i = 1; i < argc; ++i) {
        const std::string a = argv[i];
        if (a == "-i" && i + 1 < argc) { inputs.push_back(argv[++i]); }
        else if (a == "-d" && i + 1 < argc) { dir = argv[++i]; }
        else if (a == "-o" && i + 1 < argc) { out = argv[++i]; }
        else if (a == "-h" || a == "--help") { usage(); return 0; }
        else { inputs.push_back(a); }
    }

    if (inputs.empty() && dir.empty()) { usage(); return 1; }

    // יצירת תיקיית הפלט אם חסרה
    try {
        fs::path p(out);
        if (p.has_parent_path()) fs::create_directories(p.parent_path());
    } catch (...) {}

    std::ofstream outFile(out, std::ios::binary);
    if (!outFile) {
        std::printf("שגיאה: לא ניתן לכתוב %s\n", out.c_str());
        return 1;
    }

    Stats st;
    std::printf("=== בניית קורפוס האימון שלנו ===\n");

    if (!dir.empty()) {
        try {
            for (const auto& e : fs::directory_iterator(dir)) {
                if (e.path().extension() == ".txt") {
                    processFile(e.path(), outFile, st);
                }
            }
        } catch (const std::exception& e) {
            std::printf("שגיאה בסריקת תיקייה: %s\n", e.what());
        }
    }
    for (const auto& f : inputs) {
        processFile(f, outFile, st);
    }

    outFile.close();

    std::printf("=== סיכום ===\n");
    std::printf("  קבצים:        %zu\n", st.files);
    std::printf("  דוגמאות אימון: %zu\n", st.pairs);
    std::printf("  תווי משתמש:   %zu\n", st.userChars);
    std::printf("  תווי תשובה:   %zu\n", st.assistantChars);
    std::printf("  פלט: %s\n", out.c_str());

    if (st.pairs == 0) {
        std::printf("אזהרה: לא נמצאו זוגות U:/A: - בדקו את פורמט קבצי הקלט!\n");
        return 2;
    }
    return 0;
}
