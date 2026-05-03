import { useState, useEffect, useCallback } from "react";
import {
    Users,
    Plus,
    Pencil,
    Trash2,
    Loader2,
    X,
    Shield,
    User as UserIcon,
    CheckCircle2,
    XCircle,
    Eye,
    EyeOff,
    Search,
    AlertCircle,
    GraduationCap,
} from "lucide-react";
import { usersApi, User } from "@/services/api";
import { resetWizard, isWizardDone } from "@/components/SofiaWizard";
import { useAuth } from "@/contexts/AuthContext";

// ── Types ─────────────────────────────────────────────────────
interface UserFormData {
    name: string;
    email: string;
    password: string;
    role: "admin" | "assessor";
}

// ── Main Component ────────────────────────────────────────────
const UsersTab = () => {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [formData, setFormData] = useState<UserFormData>({
        name: "",
        email: "",
        password: "",
        role: "assessor",
    });
    const [showPassword, setShowPassword] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [wizardResetId, setWizardResetId] = useState<number | null>(null);

    // ── Fetch users ───────────────────────────────────────────
    const fetchUsers = useCallback(async () => {
        try {
            const res = await usersApi.getAll();
            setUsers(res.data.data);
        } catch (err) {
            console.error("Error fetching users:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    // ── Auto-clear success messages ───────────────────────────
    useEffect(() => {
        if (successMsg) {
            const t = setTimeout(() => setSuccessMsg(""), 4000);
            return () => clearTimeout(t);
        }
    }, [successMsg]);

    // ── Open modal for create ─────────────────────────────────
    const openCreateModal = () => {
        setEditingUser(null);
        setFormData({ name: "", email: "", password: "", role: "assessor" });
        setError("");
        setShowPassword(false);
        setShowModal(true);
    };

    // ── Open modal for edit ───────────────────────────────────
    const openEditModal = (user: User) => {
        setEditingUser(user);
        setFormData({
            name: user.name,
            email: user.email,
            password: "",
            role: user.role,
        });
        setError("");
        setShowPassword(false);
        setShowModal(true);
    };

    // ── Save (create or update) ───────────────────────────────
    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSaving(true);

        try {
            if (editingUser) {
                const payload: Record<string, unknown> = {
                    name: formData.name,
                    email: formData.email,
                    role: formData.role,
                };
                if (formData.password) payload.password = formData.password;
                await usersApi.update(editingUser.id, payload as Parameters<typeof usersApi.update>[1]);
                setSuccessMsg(`Usuário "${formData.name}" atualizado com sucesso`);
            } else {
                if (!formData.password) {
                    setError("Senha é obrigatória para novos usuários");
                    setSaving(false);
                    return;
                }
                await usersApi.create(formData);
                setSuccessMsg(`Usuário "${formData.name}" criado com sucesso`);
            }
            setShowModal(false);
            fetchUsers();
        } catch (err: unknown) {
            const apiErr = err as { response?: { data?: { error?: string } } };
            setError(apiErr?.response?.data?.error || "Erro ao salvar usuário");
        } finally {
            setSaving(false);
        }
    };

    // ── Delete (soft) ─────────────────────────────────────────
    const handleDelete = async (user: User) => {
        if (!window.confirm(`Tem certeza que deseja desativar o usuário "${user.name}"?\n\nO usuário não será apagado permanentemente, apenas desativado.`)) return;

        setDeletingId(user.id);
        try {
            await usersApi.delete(user.id);
            setSuccessMsg(`Usuário "${user.name}" desativado com sucesso`);
            fetchUsers();
        } catch (err: unknown) {
            const apiErr = err as { response?: { data?: { error?: string } } };
            setSuccessMsg("");
            setError(apiErr?.response?.data?.error || "Erro ao excluir usuário");
            setTimeout(() => setError(""), 4000);
        } finally {
            setDeletingId(null);
        }
    };

    // ── Wizard reset ──────────────────────────────────────────
    const handleWizardReset = (user: User) => {
        setWizardResetId(user.id);
        resetWizard(user.id);
        setSuccessMsg(`Tour de onboarding reativado para "${user.name}". Ele verá o wizard no próximo login.`);
        setTimeout(() => setWizardResetId(null), 1500);
    };

    const handleWizardDisable = (user: User) => {
        setWizardResetId(user.id);
        localStorage.setItem(`legacy_onboarding_done_${user.id}`, "true");
        setSuccessMsg(`Tour desativado para "${user.name}".`);
        setTimeout(() => setWizardResetId(null), 1500);
    };

    // ── Filtered users ────────────────────────────────────────
    const filteredUsers = users.filter(
        (u) =>
            u.name.toLowerCase().includes(search.toLowerCase()) ||
            u.email.toLowerCase().includes(search.toLowerCase())
    );

    // ── Render ────────────────────────────────────────────────
    return (
        <div className="space-y-6">
            {/* Success banner */}
            {successMsg && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400 animate-slide-up">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                    {successMsg}
                </div>
            )}

            {/* Error banner (outside the modal) */}
            {error && !showModal && (
                <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 animate-slide-up">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {error}
                </div>
            )}

            {/* Header row */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                        <Users className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold text-card-foreground">Gerenciar Usuários</h2>
                        <p className="text-xs text-muted-foreground">{users.length} usuário{users.length !== 1 ? "s" : ""} cadastrado{users.length !== 1 ? "s" : ""}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                    {/* Search */}
                    <div className="relative flex-1 sm:flex-initial">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                        <input
                            type="text"
                            placeholder="Buscar usuários..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full sm:w-56 rounded-lg border border-border bg-muted pl-9 pr-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/40 transition-all"
                        />
                    </div>

                    {/* Create button */}
                    <button
                        onClick={openCreateModal}
                        className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:opacity-90 whitespace-nowrap"
                    >
                        <Plus className="h-4 w-4" />
                        Novo Usuário
                    </button>
                </div>
            </div>

            {/* Users table */}
            <section className="rounded-2xl border border-border bg-secondary/30 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground text-sm">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Carregando usuários...
                    </div>
                ) : filteredUsers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                        <Users className="h-10 w-10 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">
                            {search ? "Nenhum usuário encontrado para esta busca" : "Nenhum usuário cadastrado"}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border bg-muted/20">
                                    <th className="text-left px-5 py-3.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Usuário</th>
                                    <th className="text-left px-5 py-3.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">E-mail</th>
                                    <th className="text-left px-5 py-3.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Função</th>
                                    <th className="text-left px-5 py-3.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                                    <th className="text-left px-5 py-3.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Tour Sofia</th>
                                    <th className="text-right px-5 py-3.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {filteredUsers.map((user) => (
                                    <tr key={user.id} className="group transition-colors hover:bg-muted/10">
                                        {/* Name + avatar */}
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-accent font-semibold text-xs uppercase">
                                                    {user.avatar_url ? (
                                                        <img src={user.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                                                    ) : (
                                                        user.name.split(" ").map(n => n[0]).join("").slice(0, 2)
                                                    )}
                                                </div>
                                                <span className="font-medium text-card-foreground">{user.name}</span>
                                            </div>
                                        </td>

                                        {/* Email */}
                                        <td className="px-5 py-4 text-muted-foreground">{user.email}</td>

                                        {/* Role */}
                                        <td className="px-5 py-4">
                                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                                                user.role === "admin"
                                                    ? "bg-accent/15 text-accent border border-accent/30"
                                                    : "bg-blue-500/10 text-blue-400 border border-blue-500/25"
                                            }`}>
                                                {user.role === "admin" ? <Shield className="h-3 w-3" /> : <UserIcon className="h-3 w-3" />}
                                                {user.role === "admin" ? "Admin" : "Assessor"}
                                            </span>
                                        </td>

                                        {/* Status */}
                                        <td className="px-5 py-4">
                                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                                                (user as unknown as { is_active: number | boolean }).is_active
                                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                                                    : "bg-red-500/10 text-red-400 border border-red-500/25"
                                            }`}>
                                                {(user as unknown as { is_active: number | boolean }).is_active ? (
                                                    <><CheckCircle2 className="h-3 w-3" /> Ativo</>
                                                ) : (
                                                    <><XCircle className="h-3 w-3" /> Inativo</>
                                                )}
                                            </span>
                                        </td>

                                        {/* Tour Sofia toggle */}
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-2">
                                                {isWizardDone(user.id) ? (
                                                    <button
                                                        onClick={() => handleWizardReset(user)}
                                                        disabled={wizardResetId === user.id}
                                                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-muted text-muted-foreground border border-border transition hover:border-accent/40 hover:text-accent disabled:opacity-60"
                                                        title="Reativar o tour de onboarding para este usuário"
                                                    >
                                                        {wizardResetId === user.id ? (
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                        ) : (
                                                            <GraduationCap className="h-3 w-3" />
                                                        )}
                                                        Reativar
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => handleWizardDisable(user)}
                                                        disabled={wizardResetId === user.id}
                                                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-accent/10 text-accent border border-accent/30 transition hover:bg-accent/20 disabled:opacity-60"
                                                        title="Desativar o tour de onboarding para este usuário"
                                                    >
                                                        {wizardResetId === user.id ? (
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                        ) : (
                                                            <GraduationCap className="h-3 w-3" />
                                                        )}
                                                        Ativo
                                                    </button>
                                                )}
                                            </div>
                                        </td>

                                        {/* Actions */}
                                        <td className="px-5 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => openEditModal(user)}
                                                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground transition hover:text-accent hover:border-accent/40"
                                                    title="Editar"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(user)}
                                                    disabled={deletingId === user.id}
                                                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground transition hover:text-red-400 hover:border-red-500/40 disabled:opacity-50"
                                                    title="Desativar"
                                                >
                                                    {deletingId === user.id ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    )}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* ── Create/Edit Modal ── */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div
                        className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl animate-slide-up mx-4"
                        style={{ animationDuration: "0.3s" }}
                    >
                        {/* Close */}
                        <button
                            onClick={() => setShowModal(false)}
                            className="absolute top-4 right-4 text-muted-foreground hover:text-card-foreground transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>

                        {/* Title */}
                        <div className="mb-6">
                            <h3 className="text-lg font-semibold text-card-foreground">
                                {editingUser ? "Editar Usuário" : "Novo Usuário"}
                            </h3>
                            <p className="text-xs text-muted-foreground mt-1">
                                {editingUser ? "Altere os dados do usuário abaixo" : "Preencha os dados para criar um novo usuário"}
                            </p>
                        </div>

                        {/* Error inside modal */}
                        {error && (
                            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
                                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSave} className="space-y-4">
                            {/* Name */}
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Nome completo</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-card-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/40 transition-all"
                                    placeholder="Ex: João Silva"
                                    required
                                />
                            </div>

                            {/* Email */}
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">E-mail</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-card-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/40 transition-all"
                                    placeholder="joao@empresa.com"
                                    required
                                />
                            </div>

                            {/* Password */}
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                                    Senha {editingUser && <span className="text-muted-foreground/40">(deixe vazio para manter)</span>}
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 pr-10 text-sm text-card-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/40 transition-all"
                                        placeholder={editingUser ? "••••••" : "Mínimo 6 caracteres"}
                                        required={!editingUser}
                                        minLength={!editingUser ? 6 : undefined}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-accent transition-colors"
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Role */}
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Função</label>
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, role: "assessor" })}
                                        className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                                            formData.role === "assessor"
                                                ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
                                                : "border-border bg-muted text-muted-foreground hover:border-border/80"
                                        }`}
                                    >
                                        <UserIcon className="h-4 w-4" />
                                        Assessor
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, role: "admin" })}
                                        className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                                            formData.role === "admin"
                                                ? "border-accent/40 bg-accent/10 text-accent"
                                                : "border-border bg-muted text-muted-foreground hover:border-border/80"
                                        }`}
                                    >
                                        <Shield className="h-4 w-4" />
                                        Admin
                                    </button>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm text-muted-foreground transition hover:text-card-foreground"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-60"
                                >
                                    {saving ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Salvando...
                                        </>
                                    ) : (
                                        <>{editingUser ? "Salvar Alterações" : "Criar Usuário"}</>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UsersTab;
