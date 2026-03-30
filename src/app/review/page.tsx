"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { AppendixOption, ReviewItem, ReviewPair, StandardEntry } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

type AuthUser = {
    id: string;
    email?: string | null;
};

export default function ReviewPage() {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [appendices, setAppendices] = useState<AppendixOption[]>([]);
    const [selectedAppendices, setSelectedAppendices] = useState<string[]>([]);
    const [item, setItem] = useState<ReviewItem | null>(null);

    const [ruDraft, setRuDraft] = useState("");
    const [kzDraft, setKzDraft] = useState("");

    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");

    const [stats, setStats] = useState({
        right: 0,
        wrongRu: 0,
        wrongKz: 0,
    });

    useEffect(() => {
        const bootstrap = async () => {
            setLoading(true);

            const {
                data: { session },
            } = await supabase.auth.getSession();

            const currentUser = session?.user
                ? { id: session.user.id, email: session.user.email }
                : null;

            setUser(currentUser);

            if (currentUser) {
                await loadAppendices();
            }

            setLoading(false);
        };

        bootstrap();

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(async (_event, session) => {
            const currentUser = session?.user
                ? { id: session.user.id, email: session.user.email }
                : null;

            setUser(currentUser);

            if (currentUser) {
                await loadAppendices();
            } else {
                setAppendices([]);
                setSelectedAppendices([]);
                setItem(null);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        setRuDraft(item?.ru.text ?? "");
        setKzDraft(item?.kz.text ?? "");
    }, [item]);

    async function loadAllRows<T>(table: string, columns: string): Promise<T[]> {
        const pageSize = 1000;
        let from = 0;
        let allRows: T[] = [];

        while (true) {
            const { data, error } = await supabase
                .from(table)
                .select(columns)
                .range(from, from + pageSize - 1);

            if (error) {
                throw error;
            }

            const rows = (data ?? []) as T[];
            allRows = [...allRows, ...rows];

            if (rows.length < pageSize) {
                break;
            }

            from += pageSize;
        }
        console.log(`[${table}] final fetched rows: ${allRows.length}`);
        return allRows;
    }

    async function loadAppendices() {
        try {
            setMessage("");

            const programs = await loadAllRows<{
                application_number: string;
                source_side: "ru_dump" | "kz_dump";
            }>("subject_programs", "application_number, source_side");

            const pairs = await loadAllRows<{
                application_number: string;
            }>("review_pairs", "application_number");

            const sideMap = new Map<string, { ru: boolean; kz: boolean }>();

            for (const row of programs) {
                const app = row.application_number;
                const side = row.source_side;

                if (!sideMap.has(app)) {
                    sideMap.set(app, { ru: false, kz: false });
                }

                const item = sideMap.get(app)!;
                if (side === "ru_dump") item.ru = true;
                if (side === "kz_dump") item.kz = true;
            }

            const pairCounts = new Map<string, number>();
            for (const row of pairs) {
                const app = row.application_number;
                pairCounts.set(app, (pairCounts.get(app) ?? 0) + 1);
            }

            const result: AppendixOption[] = [...sideMap.entries()]
                .map(([application_number, sides]) => ({
                    application_number,
                    pair_count: pairCounts.get(application_number) ?? 0,
                    has_ru: sides.ru,
                    has_kz: sides.kz,
                }))
                .sort((a, b) => Number(a.application_number) - Number(b.application_number));

            setAppendices(result);
            setSelectedAppendices(
                result
                    .filter((x) => x.pair_count > 0)
                    .slice(0, 10)
                    .map((x) => x.application_number)
            );

            if (!result.length) {
                setMessage("No appendices were returned from Supabase.");
            }
        } catch (error: any) {
            console.error("loadAppendices error:", error);
            setMessage(error.message ?? "Failed to load appendices.");
        }
    }

    async function loadNextPair() {
        if (!selectedAppendices.length) {
            setMessage("Choose at least one appendix.");
            return;
        }

        try {
            setBusy(true);
            setMessage("");

            const pairableAppendices = appendices
                .filter(
                    (app) =>
                        selectedAppendices.includes(app.application_number) &&
                        app.pair_count > 0
                )
                .map((app) => app.application_number);

            if (!pairableAppendices.length) {
                setItem(null);
                setMessage("Selected appendices currently have no generated review pairs.");
                return;
            }

            const { data: pairRows, error: pairError } = await supabase
                .from("review_pairs")
                .select("*")
                .in("application_number", pairableAppendices)
                .neq("status", "done")
                .order("application_number", { ascending: true })
                .order("goal_code", { ascending: true })
                .limit(1);

            if (pairError) {
                setMessage(pairError.message);
                return;
            }

            const pair = (pairRows?.[0] ?? null) as ReviewPair | null;

            if (!pair) {
                setItem(null);
                setMessage("No more pairs for selected appendices.");
                return;
            }

            const [ruRes, kzRes] = await Promise.all([
                supabase.from("standard_entries").select("*").eq("id", pair.ru_entry_id).single(),
                supabase.from("standard_entries").select("*").eq("id", pair.kz_entry_id).single(),
            ]);

            if (ruRes.error) {
                setMessage(ruRes.error.message);
                return;
            }

            if (kzRes.error) {
                setMessage(kzRes.error.message);
                return;
            }

            setItem({
                pair,
                ru: ruRes.data as StandardEntry,
                kz: kzRes.data as StandardEntry,
            });
        } finally {
            setBusy(false);
        }
    }

    async function saveEdits() {
        if (!item || !user) return;

        try {
            setBusy(true);
            setMessage("");

            if (ruDraft !== item.ru.text) {
                const { error } = await supabase
                    .from("standard_entries")
                    .update({
                        text: ruDraft,
                        last_edited_by: user.id,
                        last_edited_at: new Date().toISOString(),
                    })
                    .eq("id", item.ru.id);

                if (error) {
                    setMessage(error.message);
                    return;
                }
            }

            if (kzDraft !== item.kz.text) {
                const { error } = await supabase
                    .from("standard_entries")
                    .update({
                        text: kzDraft,
                        last_edited_by: user.id,
                        last_edited_at: new Date().toISOString(),
                    })
                    .eq("id", item.kz.id);

                if (error) {
                    setMessage(error.message);
                    return;
                }
            }

            setItem({
                ...item,
                ru: { ...item.ru, text: ruDraft },
                kz: { ...item.kz, text: kzDraft },
            });

            setMessage("Saved.");
        } finally {
            setBusy(false);
        }
    }

    async function markRight() {
        if (!item || !user) return;

        try {
            setBusy(true);

            const { error: pairError } = await supabase
                .from("review_pairs")
                .update({
                    status: "done",
                    reviewed_by: user.id,
                    reviewed_at: new Date().toISOString(),
                })
                .eq("id", item.pair.id);

            if (pairError) {
                setMessage(pairError.message);
                return;
            }

            await supabase.from("review_actions").insert({
                pair_id: item.pair.id,
                user_id: user.id,
                action_type: "right",
            });

            setStats((prev) => ({ ...prev, right: prev.right + 1 }));
            await loadNextPair();
        } finally {
            setBusy(false);
        }
    }

    async function markWrongRu() {
        if (!item || !user) return;

        try {
            setBusy(true);

            const { error: entryError } = await supabase
                .from("standard_entries")
                .update({
                    needs_fix: true,
                    last_edited_by: user.id,
                    last_edited_at: new Date().toISOString(),
                })
                .eq("id", item.ru.id);

            if (entryError) {
                setMessage(entryError.message);
                return;
            }

            const { error: pairError } = await supabase
                .from("review_pairs")
                .update({
                    status: "done",
                    reviewed_by: user.id,
                    reviewed_at: new Date().toISOString(),
                })
                .eq("id", item.pair.id);

            if (pairError) {
                setMessage(pairError.message);
                return;
            }

            await supabase.from("review_actions").insert({
                pair_id: item.pair.id,
                user_id: user.id,
                action_type: "wrong_ru",
                new_ru_text: ruDraft,
            });

            setStats((prev) => ({ ...prev, wrongRu: prev.wrongRu + 1 }));
            setItem((prev) =>
                prev
                    ? {
                        ...prev,
                        ru: {
                            ...prev.ru,
                            needs_fix: true,
                        },
                    }
                    : prev
            );
            await loadNextPair();
        } finally {
            setBusy(false);
        }
    }

    async function markWrongKz() {
        if (!item || !user) return;

        try {
            setBusy(true);

            const { error: entryError } = await supabase
                .from("standard_entries")
                .update({
                    needs_fix: true,
                    last_edited_by: user.id,
                    last_edited_at: new Date().toISOString(),
                })
                .eq("id", item.kz.id);

            if (entryError) {
                setMessage(entryError.message);
                return;
            }

            const { error: pairError } = await supabase
                .from("review_pairs")
                .update({
                    status: "done",
                    reviewed_by: user.id,
                    reviewed_at: new Date().toISOString(),
                })
                .eq("id", item.pair.id);

            if (pairError) {
                setMessage(pairError.message);
                return;
            }

            await supabase.from("review_actions").insert({
                pair_id: item.pair.id,
                user_id: user.id,
                action_type: "wrong_kz",
                new_kz_text: kzDraft,
            });

            setStats((prev) => ({ ...prev, wrongKz: prev.wrongKz + 1 }));
            setItem((prev) =>
                prev
                    ? {
                        ...prev,
                        kz: {
                            ...prev.kz,
                            needs_fix: true,
                        },
                    }
                    : prev
            );
            await loadNextPair();
        } finally {
            setBusy(false);
        }
    }

    async function downloadJson(language: "ru_dump" | "kz_dump") {
        try {
            setBusy(true);

            const { data: programs, error: programsError } = await supabase
                .from("subject_programs")
                .select("*")
                .eq("source_side", language)
                .in("application_number", selectedAppendices)
                .order("application_number", { ascending: true });

            if (programsError) {
                setMessage(programsError.message);
                return;
            }

            const programIds = (programs ?? []).map((p) => p.id);

            if (!programIds.length) {
                setMessage("No programs found for export.");
                return;
            }

            const { data: entries, error: entriesError } = await supabase
                .from("standard_entries")
                .select("*")
                .in("program_id", programIds)
                .order("code", { ascending: true });

            if (entriesError) {
                setMessage(entriesError.message);
                return;
            }

            const grouped = new Map<string, StandardEntry[]>();

            for (const entry of (entries ?? []) as StandardEntry[]) {
                if (!grouped.has(entry.program_id)) {
                    grouped.set(entry.program_id, []);
                }
                grouped.get(entry.program_id)!.push(entry);
            }

            const payload = (programs ?? []).map((program) => ({
                language: program.language,
                subject: program.subject_name,
                app_number: program.application_number,
                grade_level: program.grade_level,
                description: program.description,
                link: program.source_url,
                goals: (grouped.get(program.id) ?? []).map((entry) => ({
                    goal_code: entry.code,
                    goal_text: entry.text,
                    is_recommended_partial: entry.is_recommended_partial,
                    context_paths: entry.context_paths ?? [],
                })),
            }));

            const blob = new Blob([JSON.stringify(payload, null, 2)], {
                type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download =
                language === "ru_dump"
                    ? "adilet_db_dump_rus_export.json"
                    : "adilet_db_dump_kaz_export.json";
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            setBusy(false);
        }
    }

    async function signOut() {
        await supabase.auth.signOut();
        window.location.href = "/login";
    }

    const selectedCount = selectedAppendices.length;
    const canWork = !!user && selectedCount > 0;

    const statCards = useMemo(
        () => [
            { label: "Selected appendices", value: selectedCount },
            { label: "Right", value: stats.right },
            { label: "Wrong RU", value: stats.wrongRu },
            { label: "Wrong KZ", value: stats.wrongKz },
        ],
        [selectedCount, stats]
    );

    if (loading) {
        return (
            <main className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div>Loading...</div>
            </main>
        );
    }

    if (!user) {
        return (
            <main className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div>You are not logged in.</div>
                    <Button onClick={() => (window.location.href = "/login")}>Go to login</Button>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-slate-50 p-4 md:p-6">
            <div className="max-w-7xl mx-auto grid gap-4">
                <Card className="rounded-3xl">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-2xl">RUP Review</CardTitle>
                        <Button variant="outline" onClick={signOut}>
                            Sign out
                        </Button>
                    </CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-4">
                        {statCards.map((card) => (
                            <div key={card.label} className="rounded-2xl bg-slate-100 p-4">
                                <div className="text-xs text-slate-500 uppercase">{card.label}</div>
                                <div className="text-2xl font-semibold mt-2">{card.value}</div>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                {message ? (
                    <Card className="rounded-3xl">
                        <CardContent className="pt-6 text-sm text-slate-600">{message}</CardContent>
                    </Card>
                ) : null}

                <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
                    <Card className="rounded-3xl">
                        <CardHeader>
                            <CardTitle>Appendices</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex gap-2 flex-wrap">
                                <Button
                                    variant="outline"
                                    onClick={() =>
                                        setSelectedAppendices(appendices.map((a) => a.application_number))
                                    }
                                >
                                    Select all
                                </Button>
                                <Button variant="outline" onClick={() => setSelectedAppendices([])}>
                                    Clear
                                </Button>
                            </div>

                            <ScrollArea className="h-[420px] border rounded-2xl p-3">
                                <div className="grid gap-3">
                                    {appendices.map((app) => {
                                        const checked = selectedAppendices.includes(app.application_number);

                                        return (
                                            <label
                                                key={app.application_number}
                                                className="flex items-center justify-between rounded-2xl border p-3"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <Checkbox
                                                        checked={checked}
                                                        onCheckedChange={(next) => {
                                                            if (next) {
                                                                setSelectedAppendices((prev) =>
                                                                    prev.includes(app.application_number)
                                                                        ? prev
                                                                        : [...prev, app.application_number]
                                                                );
                                                            } else {
                                                                setSelectedAppendices((prev) =>
                                                                    prev.filter((v) => v !== app.application_number)
                                                                );
                                                            }
                                                        }}
                                                    />
                                                    <div>
                                                        <div className="font-medium">
                                                            Appendix {app.application_number}
                                                        </div>
                                                        <div className="text-xs text-slate-500">
                                                            {app.pair_count} pairs
                                                            {app.has_ru ? " · RU" : ""}
                                                            {app.has_kz ? " · KZ" : ""}
                                                        </div>
                                                    </div>
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            </ScrollArea>

                            <div className="grid gap-2">
                                <Button onClick={loadNextPair} disabled={!canWork || busy}>
                                    Next pair
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => downloadJson("ru_dump")}
                                    disabled={!selectedAppendices.length || busy}
                                >
                                    Download RU JSON
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => downloadJson("kz_dump")}
                                    disabled={!selectedAppendices.length || busy}
                                >
                                    Download KZ JSON
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid gap-4">
                        <Card className="rounded-3xl">
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle>Current pair</CardTitle>
                                {item ? (
                                    <div className="flex gap-2 flex-wrap">
                                        <Badge>Appendix {item.pair.application_number}</Badge>
                                        <Badge variant="secondary">{item.pair.goal_code}</Badge>
                                        {item.ru.needs_fix ? <Badge variant="destructive">RU fix</Badge> : null}
                                        {item.kz.needs_fix ? <Badge variant="destructive">KZ fix</Badge> : null}
                                    </div>
                                ) : null}
                            </CardHeader>
                            <CardContent>
                                {!item ? (
                                    <div className="rounded-2xl border border-dashed p-10 text-center text-slate-500">
                                        Choose appendices and press Next pair.
                                    </div>
                                ) : (
                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <Card className="rounded-3xl border shadow-none">
                                            <CardHeader>
                                                <CardTitle className="text-base">Russian side</CardTitle>
                                            </CardHeader>
                                            <CardContent className="space-y-3">
                                                <Textarea
                                                    value={ruDraft}
                                                    onChange={(e) => setRuDraft(e.target.value)}
                                                    className="min-h-[240px]"
                                                />
                                                <div className="text-xs text-slate-500">
                                                    Code: {item.ru.code}
                                                </div>
                                            </CardContent>
                                        </Card>

                                        <Card className="rounded-3xl border shadow-none">
                                            <CardHeader>
                                                <CardTitle className="text-base">Kazakh side</CardTitle>
                                            </CardHeader>
                                            <CardContent className="space-y-3">
                                                <Textarea
                                                    value={kzDraft}
                                                    onChange={(e) => setKzDraft(e.target.value)}
                                                    className="min-h-[240px]"
                                                />
                                                <div className="text-xs text-slate-500">
                                                    Code: {item.kz.code}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="rounded-3xl">
                            <CardContent className="pt-6">
                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                    <Button onClick={saveEdits} disabled={!item || busy}>
                                        Save edits
                                    </Button>
                                    <Button variant="outline" onClick={markRight} disabled={!item || busy}>
                                        Right
                                    </Button>
                                    <Button variant="destructive" onClick={markWrongRu} disabled={!item || busy}>
                                        Wrong RU
                                    </Button>
                                    <Button variant="destructive" onClick={markWrongKz} disabled={!item || busy}>
                                        Wrong KZ
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        <Separator />
                    </div>
                </div>
            </div>
        </main>
    );
}