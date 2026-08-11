// =============================================================================
//  Adiel Junior — selftest
//  בדיקות עצמיות של ליבת המנוע (JSON, FFT, FrameDiffer, Config, פקודות).
//  הרצה: AdielJunior.exe --selftest
// =============================================================================
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

#include "app/CommandRouter.h"
#include "ai/PromptBuilder.h"
#include "core/Config.h"
#include "core/EventBus.h"
#include "core/Fft.h"
#include "core/Json.h"
#include "core/ThreadQueue.h"
#include "vision/FrameDiffer.h"

namespace aj {

namespace {
int g_pass = 0, g_fail = 0;

void check(bool ok, const char* name) {
    if (ok) {
        ++g_pass;
        std::printf("  [PASS] %s\n", name);
    } else {
        ++g_fail;
        std::printf("  [FAIL] %s\n", name);
    }
}
} // namespace

int runSelfTests() {
    std::printf("=== Adiel Junior — בדיקות עצמיות ===\n");

    // ---- 1. JSON ----
    {
        std::printf("[1] מנוע JSON\n");
        json::Value v;
        v["name"] = json::Value("אדיאל ג'וניור");
        v["num"] = json::Value(42);
        v["pi"] = json::Value(3.14159);
        v["ok"] = json::Value(true);
        v["arr"][0] = json::Value("he");
        v["arr"][1] = json::Value("en");
        v["nested"]["deep"] = json::Value(7.5);

        std::string dumped = v.dump();
        json::Value back = json::parse(dumped);
        check(back.getString("name") == "אדיאל ג'וניור", "עברית round-trip");
        check(back.getInt("num") == 42, "מספר שלם");
        check(std::fabs(back.getNumber("pi") - 3.14159) < 1e-9, "מספר עשרוני");
        check(back.getBool("ok") == true, "בוליאני");
        const json::Value* arr = back.getArray("arr");
        check(arr && arr->array().size() == 2 && arr->array()[0].asString() == "he", "מערך");
        const json::Value* nested = back.getObject("nested");
        check(nested && std::fabs(nested->getNumber("deep") - 7.5) < 1e-9, "אובייקט מקונן");
        check(json::parse("{bad json").isNull(), "תחביר שגוי → null");
    }

    // ---- 2. Config ----
    {
        std::printf("[2] קונפיג\n");
        Config::writeDefault("/tmp/aj_test_config.json");
        Config cfg = Config::load("/tmp/aj_test_config.json");
        check(cfg.modelPath.find("gguf") != std::string::npos, "ברירת מחדל model_path");
        check(cfg.gpuLayers == -1, "gpu_layers = -1 (כל ה-VRAM)");
        check(cfg.wakeKeyword == "אדיאל ג'וניור", "מילת הפעלה");
        check(cfg.hotkeys.listen == 0x4C, "מקשי קיצור");
    }

    // ---- 3. FFT ----
    {
        std::printf("[3] FFT\n");
        constexpr int N = 1024;
        constexpr int kRate = 16000;
        constexpr double kFreq = 440.0;
        std::vector<float> sig(static_cast<size_t>(N));
        for (int i = 0; i < N; ++i) {
            sig[static_cast<size_t>(i)] = static_cast<float>(std::sin(2.0 * 3.14159265 * kFreq * i / kRate));
        }
        Fft fft(static_cast<size_t>(N));
        fft.compute(sig.data(), sig.size());
        size_t peak = 0;
        float best = 0.0f;
        for (size_t i = 1; i < fft.bins(); ++i) {
            if (fft.bin(i) > best) { best = fft.bin(i); peak = i; }
        }
        // שיא צפוי ב-bin: freq * N / rate = 440*1024/16000 = 28.16
        check(peak >= 27 && peak <= 29, "שיא ספקטרום ב-440Hz (bin=28)");
        check(fft.energy() > 0.0f, "אנרגיה > 0");
    }

    // ---- 4. FrameDiffer ----
    {
        std::printf("[4] FrameDiffer\n");
        auto f1 = std::make_shared<Frame>();
        f1->width = 320; f1->height = 200; f1->stride = 320 * 4;
        f1->pixels.assign(static_cast<size_t>(320 * 200 * 4), 128);
        f1->empty = false;

        FrameDiffer differ;
        check(differ.diff(f1) == 0.0, "פריים ראשון — אתחול");
        check(differ.diff(f1) == 0.0, "פריים זהה — ללא שינוי");

        auto f2 = std::make_shared<Frame>(*f1);
        // צביעת חצי תחתון בלבן
        for (int y = 100; y < 200; ++y) {
            for (int x = 0; x < 320; ++x) {
                uint8_t* p = f2->row(y) + static_cast<size_t>(x) * 4;
                p[0] = p[1] = p[2] = 255;
            }
        }
        double ratio = differ.diff(f2);
        check(ratio > 0.35 && ratio < 0.65, "חצי מסך שונה → ratio≈0.5");
    }

    // ---- 5. ThreadQueue ----
    {
        std::printf("[5] ThreadQueue\n");
        ThreadQueue<int> q;
        q.push(1); q.push(2); q.push(3);
        auto a = q.pop();
        auto b = q.pop();
        auto c = q.pop();
        check(a && *a == 1 && b && *b == 2 && c && *c == 3, "סדר FIFO");
        check(q.size() == 0, "ריק בסוף");
    }

    // ---- 6. CommandRouter ----
    {
        std::printf("[6] ניתוב פקודות עברית\n");
        CommandRouter router;
        auto r1 = router.route("שים בצד");
        check(r1.handled && r1.action == CommandAction::Dock, "\"שים בצד\" → Dock");
        auto r2 = router.route("תחזרי לאמצע");
        check(r2.handled && r2.action == CommandAction::Center, "\"תחזרי לאמצע\" → Center");
        auto r3 = router.route("הסתרי את עצמך");
        check(r3.handled && r3.action == CommandAction::Hide, "\"הסתרי\" → Hide");
        auto r4 = router.route("מה על המסך עכשיו");
        check(r4.handled && r4.action == CommandAction::ScreenSummary, "\"מה על המסך\" → ScreenSummary");
        auto r5 = router.route("ספר לי בדיחה");
        check(!r5.handled, "שאלה חופשית → לא פקודת מערכת");
    }

    // ---- 7. PromptBuilder ----
    {
        std::printf("[7] PromptBuilder\n");
        std::string sys = PromptBuilder::systemPrompt();
        check(sys.find("אדיאל ג'וניור") != std::string::npos, "מערכת הנחיות בעברית");
        std::string ctx = PromptBuilder::screenContextBlock("chrome.exe", "שלום עולם", 1920, 1080);
        check(ctx.find("chrome.exe") != std::string::npos && ctx.find("שלום עולם") != std::string::npos,
              "בלוק הקשר מסך");
    }

    // ---- 8. EventBus ----
    {
        std::printf("[8] EventBus\n");
        EventBus& bus = EventBus::instance();
        int got = 0;
        auto id = bus.subscribe(EventType::StateChanged, [&](const Event& e) {
            if (e.payload == "speaking") ++got;
        });
        bus.emit(EventType::StateChanged, "speaking");
        bus.emit(EventType::StateChanged, "speaking");
        bus.unsubscribe(EventType::StateChanged, id);
        bus.emit(EventType::StateChanged, "speaking");
        check(got == 2, "מינוי/ביטול + שידור");
    }

    std::printf("=== סיכום: %d עברו, %d נכשלו ===\n", g_pass, g_fail);
    return g_fail == 0 ? 0 : 1;
}

} // namespace aj
