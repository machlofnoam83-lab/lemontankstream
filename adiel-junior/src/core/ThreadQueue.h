// =============================================================================
//  Adiel Junior — ThreadQueue
//  תור MPMC פשוט עם נעילה — מעבר הודעות בין חוטי המנוע (קול, AI, HUD).
// =============================================================================
#pragma once

#include <condition_variable>
#include <deque>
#include <mutex>
#include <optional>

namespace aj {

template <typename T>
class ThreadQueue {
public:
    void push(T item) {
        {
            std::lock_guard<std::mutex> lock(m_mtx);
            m_q.push_back(std::move(item));
        }
        m_cv.notify_one();
    }

    // חסימתי: מחזיר את האלמנט הבא או std::nullopt אם נסגר
    std::optional<T> pop() {
        std::unique_lock<std::mutex> lock(m_mtx);
        m_cv.wait(lock, [this] { return !m_q.empty() || m_closed; });
        if (m_q.empty()) return std::nullopt;
        T item = std::move(m_q.front());
        m_q.pop_front();
        return item;
    }

    std::optional<T> tryPop() {
        std::lock_guard<std::mutex> lock(m_mtx);
        if (m_q.empty()) return std::nullopt;
        T item = std::move(m_q.front());
        m_q.pop_front();
        return item;
    }

    void close() {
        {
            std::lock_guard<std::mutex> lock(m_mtx);
            m_closed = true;
        }
        m_cv.notify_all();
    }

    void clear() {
        std::lock_guard<std::mutex> lock(m_mtx);
        m_q.clear();
    }

    size_t size() const {
        std::lock_guard<std::mutex> lock(m_mtx);
        return m_q.size();
    }

private:
    mutable std::mutex m_mtx;
    std::condition_variable m_cv;
    std::deque<T> m_q;
    bool m_closed = false;
};

} // namespace aj
