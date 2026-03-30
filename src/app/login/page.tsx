"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");

    async function handleLogin() {
        try {
            setLoading(true);
            setMessage("");

            const redirectTo =
                typeof window !== "undefined"
                    ? `${window.location.origin}/review`
                    : undefined;

            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    emailRedirectTo: redirectTo,
                },
            });

            if (error) {
                setMessage(error.message);
                return;
            }

            setMessage("Magic link sent. Open your email and continue.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md rounded-3xl">
                <CardHeader>
                    <CardTitle className="text-2xl">RUP Review Login</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="h-12 rounded-2xl"
                        />
                    </div>

                    <Button
                        onClick={handleLogin}
                        disabled={!email || loading}
                        className="w-full h-12 rounded-2xl"
                    >
                        {loading ? "Sending..." : "Send magic link"}
                    </Button>

                    {message ? (
                        <div className="text-sm text-slate-600">{message}</div>
                    ) : null}
                </CardContent>
            </Card>
        </main>
    );
}