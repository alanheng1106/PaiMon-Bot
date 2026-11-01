import path from 'path';
import BaseJsonFileStore from '../../utils/BaseJsonFileStore';

export interface MemoryFact {
    id: string;
    content: string;
    category?: 'preference' | 'habit' | 'project' | 'profile' | 'other' | string;
    createdAt: number;
    updatedAt: number;
}

export interface UserMemoryProfile {
    userId: string;
    userName: string;
    memories: MemoryFact[];
    updatedAt: number;
}

export type UserMemoryData = Record<string, UserMemoryProfile>;

/**
 * UserMemoryStore — Manages persistent user long-term memories across channels and bot reboots.
 * Backed by debounced JSON storage (BaseJsonFileStore).
 */
export class UserMemoryStore extends BaseJsonFileStore<UserMemoryData> {
    public static readonly DEFAULT_MAX_MEMORIES_PER_USER = 50;
    #maxMemoriesPerUser: number;

    constructor(
        dataDir: string = path.join(process.cwd(), 'data'),
        filePath: string = path.join(dataDir, 'user-memories.json'),
        maxMemoriesPerUser: number = UserMemoryStore.DEFAULT_MAX_MEMORIES_PER_USER,
        debounceMs: number = 500
    ) {
        super(dataDir, filePath, debounceMs);
        this.#maxMemoriesPerUser = maxMemoriesPerUser;
    }

    get maxMemoriesPerUser(): number {
        return this.#maxMemoriesPerUser;
    }

    /**
     * Get user profile if exists.
     */
    getProfile(userId: string): UserMemoryProfile | null {
        if (!userId || !this.data[userId]) return null;
        return this.data[userId];
    }

    /**
     * Retrieve all saved memories for a specific user.
     */
    getMemories(userId: string): MemoryFact[] {
        const profile = this.getProfile(userId);
        return profile ? [...profile.memories] : [];
    }

    /**
     * Add or update a memory fact for a user with smart deduplication.
     */
    addMemory(
        userId: string,
        userName: string,
        content: string,
        category: string = 'other'
    ): { success: boolean; memory: MemoryFact; isDuplicate: boolean } {
        if (!userId || !content || !content.trim()) {
            return {
                success: false,
                memory: { id: '', content: '', createdAt: 0, updatedAt: 0 },
                isDuplicate: false
            };
        }

        const trimmedContent = content.trim();
        const now = Date.now();

        // Disallow storing redundant user name/nickname facts (Discord username is already canonical)
        if (
            /^(?:暱稱(?:是|為|叫)?|稱呼(?:為|是|叫)?|名字(?:是|叫|為)?|在伺服器(?:暱稱|叫|名為)?)\s*[:：]?\s*.+/i.test(
                trimmedContent
            )
        ) {
            return {
                success: false,
                memory: { id: '', content: '', createdAt: 0, updatedAt: 0 },
                isDuplicate: false
            };
        }

        if (!this.data[userId]) {
            this.data[userId] = {
                userId,
                userName: userName || '使用者',
                memories: [],
                updatedAt: now
            };
        }

        const profile = this.data[userId];
        if (userName) {
            profile.userName = userName;
        }
        profile.updatedAt = now;

        // Normalize text for comparison (remove spaces & basic punctuation)
        const normalize = (s: string) => s.toLowerCase().replace(/[\s\p{P}]/gu, '');
        const normTarget = normalize(trimmedContent);

        // Check for existing similar or duplicate fact
        const existingIndex = profile.memories.findIndex((m) => {
            const normExisting = normalize(m.content);
            if (normExisting === normTarget) return true;
            if (normTarget.length > 6 && normExisting.includes(normTarget)) return true;
            if (normExisting.length > 6 && normTarget.includes(normExisting)) return true;
            return false;
        });

        if (existingIndex !== -1) {
            // Update existing fact with newer content & timestamp
            const existing = profile.memories[existingIndex];
            existing.content = trimmedContent;
            existing.category = category || existing.category || 'other';
            existing.updatedAt = now;
            this.save();
            return { success: true, memory: existing, isDuplicate: true };
        }

        // New fact creation
        const newFact: MemoryFact = {
            id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            content: trimmedContent,
            category: category || 'other',
            createdAt: now,
            updatedAt: now
        };

        profile.memories.push(newFact);

        // Prune oldest if exceeds maximum cap
        if (profile.memories.length > this.#maxMemoriesPerUser) {
            profile.memories.splice(0, profile.memories.length - this.#maxMemoriesPerUser);
        }

        this.save();
        return { success: true, memory: newFact, isDuplicate: false };
    }

    /**
     * Remove a single memory by ID for a user.
     */
    removeMemory(userId: string, memoryId: string): boolean {
        const profile = this.getProfile(userId);
        if (!profile) return false;

        const initialLength = profile.memories.length;
        profile.memories = profile.memories.filter((m) => m.id !== memoryId);

        if (profile.memories.length !== initialLength) {
            profile.updatedAt = Date.now();
            this.save();
            return true;
        }
        return false;
    }

    /**
     * Remove memory matching substring text.
     */
    removeMemoryByContent(userId: string, textQuery: string): boolean {
        const profile = this.getProfile(userId);
        if (!profile || !textQuery.trim()) return false;

        const target = textQuery.trim().toLowerCase();
        const initialLength = profile.memories.length;
        profile.memories = profile.memories.filter((m) => !m.content.toLowerCase().includes(target));

        if (profile.memories.length !== initialLength) {
            profile.updatedAt = Date.now();
            this.save();
            return true;
        }
        return false;
    }

    /**
     * Clear all memories for a user.
     */
    clearMemories(userId: string): boolean {
        if (!userId || !this.data[userId]) return false;
        delete this.data[userId];
        this.save();
        return true;
    }

    /**
     * Format saved memories for injection into AI system prompt.
     */
    formatMemoriesForPrompt(userId: string, maxItems: number = 30): string {
        const profile = this.getProfile(userId);
        if (!profile || !profile.memories || profile.memories.length === 0) {
            return '';
        }

        const recent = profile.memories.slice(-maxItems);
        const bulletPoints = recent.map((m) => `- ${m.content}`).join('\n');
        const userDisplay = profile.userName || '旅行者';

        return `【關於旅行者「${userDisplay}」的專屬長期記憶（派蒙的小本本）】\n${bulletPoints}\n（請在回答時自然結合以上已知記憶，避免重新詢問已知事實或偏好）`;
    }
}

export default UserMemoryStore;
