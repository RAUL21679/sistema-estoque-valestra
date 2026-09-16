import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  ShoppingCart,
  AlertTriangle,
  Clock,
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Building2,
  Store,
  CheckCircle2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Unidades: 1 matriz + 10 filiais
// ---------------------------------------------------------------------------
const UNITS = [
  { id: "matriz", nome: "Matriz", tipo: "matriz" },
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `filial${i + 1}`,
    nome: `Filial ${i + 1}`,
    tipo: "filial",
  })),
];
const unitLabel = (id) => UNITS.find((u) => u.id === id)?.nome || id;

// ---------------------------------------------------------------------------
// Utilitários de data / número
// ---------------------------------------------------------------------------
const todayISO = () => new Date().toISOString().slice(0, 10);
const toUTC = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const daysUntil = (iso) => {
  if (!iso) return null;
  return Math.round((toUTC(iso) - toUTC(todayISO())) / 86400000);
};
const formatDateBR = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const formatBRL = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(v) || 0
  );
const formatNum = (v) => new Intl.NumberFormat("pt-BR").format(Number(v) || 0);
const uid = (prefix) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function expiryStatus(iso) {
  const d = daysUntil(iso);
  if (d === null) return { key: "sem-data", label: "Sem validade", days: null };
  if (d < 0) return { key: "vencido", label: `Vencido há ${Math.abs(d)}d`, days: d };
  if (d <= 30) return { key: "proximo", label: `Vence em ${d}d`, days: d };
  return { key: "ok", label: `Vence em ${d}d`, days: d };
}

// ---------------------------------------------------------------------------
// Camada de storage (window.storage) — sempre com tratamento de erro
// ---------------------------------------------------------------------------
async function storageGet(key, shared) {
  try {
    const res = await window.storage.get(key, shared);
    return res ? JSON.parse(res.value) : null;
  } catch (e) {
    return null; // chave inexistente ou falha de leitura
  }
}
async function storageSet(key, value, shared) {
  try {
    const res = await window.storage.set(key, JSON.stringify(value), shared);
    return !!res;
  } catch (e) {
    return false;
  }
}

const emptyUnitData = () => ({ stock: {}, movements: [] });

export default function App() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [products, setProducts] = useState([]);
  const [unitsData, setUnitsData] = useState({}); // { [unitId]: { stock, movements } }
  const [selectedUnit, setSelectedUnit] = useState("matriz");
  const [activeTab, setActiveTab] = useState("dashboard");

  const isMatriz = selectedUnit === "matriz";

  // -------------------------------------------------------------------
  // Carregamento inicial
  // -------------------------------------------------------------------
  const loadAll = useCallback(async (isRefresh) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const [prod, prefRaw, ...unitResults] = await Promise.all([
        storageGet("products", true),
        storageGet("unidade-selecionada", false),
        ...UNITS.map((u) => storageGet(`unit:${u.id}`, true)),
      ]);

      setProducts(Array.isArray(prod) ? prod : []);

      const nextUnitsData = {};
      UNITS.forEach((u, idx) => {
        nextUnitsData[u.id] = unitResults[idx] || emptyUnitData();
      });
      setUnitsData(nextUnitsData);

      if (prefRaw && UNITS.some((u) => u.id === prefRaw)) {
        setSelectedUnit(prefRaw);
      }
    } catch (e) {
      setError(
        "Não foi possível carregar os dados do estoque. Verifique sua conexão e tente novamente."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAll(false);
  }, [loadAll]);

  // -------------------------------------------------------------------
  // Troca de unidade (preferência pessoal, não compartilhada)
  // -------------------------------------------------------------------
  async function handleSelectUnit(unitId) {
    setSelectedUnit(unitId);
    if (activeTab === "produtos" && unitId !== "matriz") setActiveTab("dashboard");
    const ok = await storageSet("unidade-selecionada", unitId, false);
    if (!ok) {
      // Falha silenciosa: a seleção ainda funciona nesta sessão, só não persiste
    }
  }

  // -------------------------------------------------------------------
  // Produtos (catálogo central — gerenciado pela matriz)
  // -------------------------------------------------------------------
  async function saveProducts(next, successMsg) {
    const prev = products;
    setProducts(next); // otimista
    const ok = await storageSet("products", next, true);
    if (!ok) {
      setProducts(prev);
      setError("Não foi possível salvar o catálogo de produtos. Tente novamente.");
    } else if (successMsg) {
      flashNotice(successMsg);
    }
  }

  function upsertProduct(form, editingId) {
    if (editingId) {
      saveProducts(
        products.map((p) => (p.id === editingId ? { ...p, ...form } : p)),
        "Produto atualizado."
      );
    } else {
      saveProducts([...products, { id: uid("p"), ...form }], "Produto cadastrado.");
    }
  }

  function removeProduct(id) {
    saveProducts(products.filter((p) => p.id !== id), "Produto removido.");
  }

  // -------------------------------------------------------------------
  // Estoque / movimentações por unidade
  // -------------------------------------------------------------------
  async function saveUnitData(unitId, next, successMsg) {
    const prev = unitsData[unitId] || emptyUnitData();
    setUnitsData((s) => ({ ...s, [unitId]: next })); // otimista
    const ok = await storageSet(`unit:${unitId}`, next, true);
    if (!ok) {
      setUnitsData((s) => ({ ...s, [unitId]: prev }));
      setError(
        `Não foi possível salvar a movimentação de ${unitLabel(unitId)}. Tente novamente.`
      );
    } else if (successMsg) {
      flashNotice(successMsg);
    }
  }

  function registerMovement(unitId, { productId, tipo, quantidade, data, obs }) {
    const current = unitsData[unitId] || emptyUnitData();
    const qty = Math.max(0, Number(quantidade) || 0);
    const curQty = current.stock[productId] || 0;
    const newQty = tipo === "entrada" ? curQty + qty : Math.max(0, curQty - qty);
    const movement = {
      id: uid("m"),
      productId,
      tipo,
      quantidade: qty,
      data: data || todayISO(),
      obs: obs || "",
    };
    const next = {
      stock: { ...current.stock, [productId]: newQty },
      movements: [movement, ...current.movements].slice(0, 500),
    };
    saveUnitData(
      unitId,
      next,
      tipo === "entrada" ? "Entrada registrada." : "Saída registrada."
    );
  }

  function flashNotice(msg) {
    setNotice(msg);
    setTimeout(() => setNotice((m) => (m === msg ? null : m)), 3000);
  }

  // -------------------------------------------------------------------
  // Derivados
  // -------------------------------------------------------------------
  const totalStockByProduct = useMemo(() => {
    const totals = {};
    products.forEach((p) => (totals[p.id] = 0));
    UNITS.forEach((u) => {
      const stock = unitsData[u.id]?.stock || {};
      Object.entries(stock).forEach(([pid, qty]) => {
        totals[pid] = (totals[pid] || 0) + (Number(qty) || 0);
      });
    });
    return totals;
  }, [products, unitsData]);

  const stockBreakdown = useCallback(
    (productId) =>
      UNITS.map((u) => ({
        unitId: u.id,
        nome: u.nome,
        qty: unitsData[u.id]?.stock?.[productId] || 0,
      })).filter((row) => row.qty > 0),
    [unitsData]
  );

  // Consumo médio diário, calculado sobre a janela dos últimos 90 dias de saídas
  const avgDailyConsumption = useCallback(
    (productId) => {
      const cutoff = new Date();
      cutoff.setUTCDate(cutoff.getUTCDate() - 90);
      const cutoffTime = cutoff.getTime();
      let total = 0;
      UNITS.forEach((u) => {
        const movs = unitsData[u.id]?.movements || [];
        movs.forEach((m) => {
          if (
            m.productId === productId &&
            m.tipo === "saida" &&
            new Date(m.data).getTime() >= cutoffTime
          ) {
            total += Number(m.quantidade) || 0;
          }
        });
      });
      return total / 90;
    },
    [unitsData]
  );

  const alerts = useMemo(() => {
    const list = products.map((p) => ({ p, status: expiryStatus(p.validade) }));
    return {
      vencidos: list.filter((x) => x.status.key === "vencido"),
      proximos: list.filter((x) => x.status.key === "proximo"),
    };
  }, [products]);

  // Estoque de segurança: 60 dias de consumo médio diário
  // Cobertura adicional: 45 dias de consumo até a próxima compra chegar
  const SAFETY_DAYS = 60;
  const COVERAGE_DAYS = 45;

  const purchaseSuggestions = useMemo(() => {
    return products
      .map((p) => {
        const status = expiryStatus(p.validade);
        const totalStock = totalStockByProduct[p.id] || 0;
        // Estoque vencido não pode ser considerado disponível para uso
        const usableStock = status.key === "vencido" ? 0 : totalStock;
        const consumoDiario = avgDailyConsumption(p.id);
        const estoqueSeguranca = consumoDiario * SAFETY_DAYS;
        const necessidadeConsumo = consumoDiario * COVERAGE_DAYS;
        const necessidade = estoqueSeguranca + necessidadeConsumo;
        const sugestao = Math.max(0, Math.ceil(necessidade - usableStock));
        return {
          product: p,
          totalStock,
          usableStock,
          consumoDiario,
          estoqueSeguranca,
          necessidadeConsumo,
          sugestao,
          status,
          custoEstimado: sugestao * (Number(p.custoUnitario) || 0),
        };
      })
      .sort((a, b) => b.sugestao - a.sugestao);
  }, [products, totalStockByProduct, avgDailyConsumption]);

  const purchaseTotalCost = purchaseSuggestions.reduce(
    (acc, x) => acc + x.custoEstimado,
    0
  );
  const purchaseItemCount = purchaseSuggestions.filter((x) => x.sugestao > 0).length;

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  return (
    <div className="shell">
      <style>{css}</style>

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Package size={18} strokeWidth={2.25} />
          </div>
          <div>
            <div className="brand-title">Estoque Central</div>
            <div className="brand-sub">Matriz + 10 filiais</div>
          </div>
        </div>

        <nav className="nav">
          <NavItem
            icon={<LayoutDashboard size={17} />}
            label="Painel"
            active={activeTab === "dashboard"}
            onClick={() => setActiveTab("dashboard")}
          />
          <NavItem
            icon={<Package size={17} />}
            label="Produtos"
            active={activeTab === "produtos"}
            onClick={() => setActiveTab("produtos")}
          />
          <NavItem
            icon={<ArrowLeftRight size={17} />}
            label="Movimentações"
            active={activeTab === "movimentacoes"}
            onClick={() => setActiveTab("movimentacoes")}
          />
          <NavItem
            icon={<ShoppingCart size={17} />}
            label="Pedido de compra"
            active={activeTab === "pedido"}
            onClick={() => setActiveTab("pedido")}
            badge={purchaseItemCount > 0 ? purchaseItemCount : null}
          />
        </nav>

        <div className="unit-switcher">
          <label className="unit-label">Visualizando como</label>
          <div className="unit-select-wrap">
            {isMatriz ? <Building2 size={15} /> : <Store size={15} />}
            <select
              value={selectedUnit}
              onChange={(e) => handleSelectUnit(e.target.value)}
              className="unit-select"
            >
              {UNITS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="unit-caret" />
          </div>
          <p className="unit-hint">
            {isMatriz
              ? "A matriz enxerga o estoque consolidado de todas as unidades."
              : "Filiais enxergam apenas o próprio estoque."}
          </p>
        </div>
      </aside>

      <main className="content">
        <TopBar
          refreshing={refreshing}
          onRefresh={() => loadAll(true)}
          error={error}
          notice={notice}
          onDismissError={() => setError(null)}
        />

        {loading ? (
          <LoadingState />
        ) : (
          <div className="tab-body">
            {activeTab === "dashboard" && (
              <Dashboard
                isMatriz={isMatriz}
                selectedUnit={selectedUnit}
                products={products}
                unitsData={unitsData}
                totalStockByProduct={totalStockByProduct}
                stockBreakdown={stockBreakdown}
                alerts={alerts}
              />
            )}
            {activeTab === "produtos" && (
              <Produtos
                isMatriz={isMatriz}
                products={products}
                onUpsert={upsertProduct}
                onRemove={removeProduct}
              />
            )}
            {activeTab === "movimentacoes" && (
              <Movimentacoes
                isMatriz={isMatriz}
                selectedUnit={selectedUnit}
                products={products}
                unitsData={unitsData}
                onRegister={registerMovement}
              />
            )}
            {activeTab === "pedido" && (
              <PedidoCompra
                suggestions={purchaseSuggestions}
                totalCost={purchaseTotalCost}
                itemCount={purchaseItemCount}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componentes de layout
// ---------------------------------------------------------------------------
function NavItem({ icon, label, active, onClick, badge }) {
  return (
    <button className={`nav-item ${active ? "is-active" : ""}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
      {badge ? <span className="nav-badge">{badge}</span> : null}
    </button>
  );
}

function TopBar({ refreshing, onRefresh, error, notice, onDismissError }) {
  return (
    <div className="topbar">
      <div className="topbar-status">
        {error ? (
          <div className="banner banner-error">
            <AlertTriangle size={15} />
            <span>{error}</span>
            <button className="banner-close" onClick={onDismissError} aria-label="Fechar">
              <X size={13} />
            </button>
          </div>
        ) : notice ? (
          <div className="banner banner-ok">
            <CheckCircle2 size={15} />
            <span>{notice}</span>
          </div>
        ) : (
          <div className="topbar-spacer" />
        )}
      </div>
      <button className="refresh-btn" onClick={onRefresh} disabled={refreshing}>
        {refreshing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
        Atualizar
      </button>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="loading-state">
      <Loader2 size={22} className="spin" />
      <p>Carregando dados do estoque…</p>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    vencido: { cls: "badge-danger", label: status.label },
    proximo: { cls: "badge-warning", label: status.label },
    ok: { cls: "badge-success", label: status.label },
    "sem-data": { cls: "badge-neutral", label: status.label },
  };
  const cfg = map[status.key];
  return <span className={`badge ${cfg.cls}`}>{cfg.label}</span>;
}

// ---------------------------------------------------------------------------
// Painel (dashboard)
// ---------------------------------------------------------------------------
function Dashboard({
  isMatriz,
  selectedUnit,
  products,
  unitsData,
  totalStockByProduct,
  stockBreakdown,
  alerts,
}) {
  const [expanded, setExpanded] = useState(() => new Set());

  const rows = products.map((p) => {
    const qty = isMatriz
      ? totalStockByProduct[p.id] || 0
      : unitsData[selectedUnit]?.stock?.[p.id] || 0;
    return { product: p, qty, status: expiryStatus(p.validade) };
  });

  const totalUnidades = rows.reduce((acc, r) => acc + r.qty, 0);

  function toggle(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="stack-lg">
      <div className="cards-grid">
        <StatCard
          icon={<Package size={16} />}
          label="Produtos cadastrados"
          value={formatNum(products.length)}
        />
        <StatCard
          icon={<ArrowLeftRight size={16} />}
          label={isMatriz ? "Unidades em estoque (consolidado)" : "Unidades em estoque"}
          value={formatNum(totalUnidades)}
        />
        <StatCard
          icon={<AlertTriangle size={16} />}
          label="Produtos vencidos"
          value={formatNum(alerts.vencidos.length)}
          tone={alerts.vencidos.length ? "danger" : "neutral"}
        />
        <StatCard
          icon={<Clock size={16} />}
          label="Vencendo em até 30 dias"
          value={formatNum(alerts.proximos.length)}
          tone={alerts.proximos.length ? "warning" : "neutral"}
        />
      </div>

      {(alerts.vencidos.length > 0 || alerts.proximos.length > 0) && (
        <div className="panel">
          <div className="panel-header">
            <h3>Atenção à validade</h3>
          </div>
          <ul className="alert-list">
            {alerts.vencidos.map(({ p, status }) => (
              <li key={p.id} className="alert-row alert-danger">
                <AlertTriangle size={14} />
                <span className="alert-name">{p.nome}</span>
                <span className="alert-meta">
                  Vencido em {formatDateBR(p.validade)} · {status.label}
                </span>
              </li>
            ))}
            {alerts.proximos.map(({ p, status }) => (
              <li key={p.id} className="alert-row alert-warning">
                <Clock size={14} />
                <span className="alert-name">{p.nome}</span>
                <span className="alert-meta">
                  Validade em {formatDateBR(p.validade)} · {status.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <h3>{isMatriz ? "Estoque consolidado" : `Estoque — ${unitLabel(selectedUnit)}`}</h3>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            title="Nenhum produto cadastrado"
            desc="Cadastre o primeiro produto na aba Produtos para começar a controlar o estoque."
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                {isMatriz && <th className="col-expand" />}
                <th>Produto</th>
                <th>Categoria</th>
                <th>Validade</th>
                <th className="num">Estoque</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ product, qty, status }) => (
                <React.Fragment key={product.id}>
                  <tr>
                    {isMatriz && (
                      <td className="col-expand">
                        <button
                          className="expand-btn"
                          onClick={() => toggle(product.id)}
                          aria-label="Detalhar por unidade"
                        >
                          {expanded.has(product.id) ? (
                            <ChevronDown size={14} />
                          ) : (
                            <ChevronRight size={14} />
                          )}
                        </button>
                      </td>
                    )}
                    <td className="cell-strong">{product.nome}</td>
                    <td className="cell-muted">{product.categoria || "—"}</td>
                    <td>
                      <StatusBadge status={status} />
                    </td>
                    <td className="num mono">
                      {formatNum(qty)} {product.unidadeMedida || ""}
                    </td>
                  </tr>
                  {isMatriz && expanded.has(product.id) && (
                    <tr className="sub-row">
                      <td />
                      <td colSpan={4}>
                        {stockBreakdown(product.id).length === 0 ? (
                          <span className="cell-muted">Sem estoque em nenhuma unidade.</span>
                        ) : (
                          <div className="breakdown">
                            {stockBreakdown(product.id).map((b) => (
                              <span key={b.unitId} className="breakdown-chip">
                                {b.nome}: <strong>{formatNum(b.qty)}</strong>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, tone = "neutral" }) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <div className="stat-icon">{icon}</div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

function EmptyState({ title, desc }) {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      <p className="empty-desc">{desc}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Produtos (catálogo)
// ---------------------------------------------------------------------------
function Produtos({ isMatriz, products, onUpsert, onRemove }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(p) {
    setEditing(p);
    setFormOpen(true);
  }

  return (
    <div className="stack-lg">
      <div className="panel">
        <div className="panel-header">
          <h3>Catálogo de produtos</h3>
          {isMatriz && (
            <button className="btn btn-primary" onClick={openNew}>
              <Plus size={15} /> Novo produto
            </button>
          )}
        </div>

        {!isMatriz && (
          <p className="hint-text">
            Somente a Matriz cadastra e edita produtos. {unitLabel("filial")} pode visualizar o
            catálogo e registrar movimentações de estoque.
          </p>
        )}

        {products.length === 0 ? (
          <EmptyState
            title="Nenhum produto cadastrado"
            desc={
              isMatriz
                ? "Clique em “Novo produto” para começar."
                : "Aguarde a Matriz cadastrar produtos no catálogo."
            }
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Categoria</th>
                <th>Unidade</th>
                <th className="num">Custo unit.</th>
                <th>Validade</th>
                {isMatriz && <th className="col-actions" />}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const status = expiryStatus(p.validade);
                return (
                  <tr key={p.id}>
                    <td className="cell-strong">{p.nome}</td>
                    <td className="cell-muted">{p.categoria || "—"}</td>
                    <td className="cell-muted">{p.unidadeMedida || "—"}</td>
                    <td className="num mono">{formatBRL(p.custoUnitario)}</td>
                    <td>
                      <div className="stack-xs">
                        <span className="mono">{formatDateBR(p.validade)}</span>
                        <StatusBadge status={status} />
                      </div>
                    </td>
                    {isMatriz && (
                      <td className="col-actions">
                        <button className="icon-btn" onClick={() => openEdit(p)} aria-label="Editar">
                          <Pencil size={14} />
                        </button>
                        <button
                          className="icon-btn icon-btn-danger"
                          onClick={() => setConfirmDelete(p)}
                          aria-label="Excluir"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {formOpen && (
        <ProductForm
          initial={editing}
          onClose={() => setFormOpen(false)}
          onSubmit={(form) => {
            onUpsert(form, editing?.id);
            setFormOpen(false);
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Excluir produto"
          message={`Excluir “${confirmDelete.nome}” do catálogo? O histórico de estoque nas unidades permanecerá registrado, mas o produto deixará de aparecer nas telas.`}
          confirmLabel="Excluir"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            onRemove(confirmDelete.id);
            setConfirmDelete(null);
          }}
        />
      )}
    </div>
  );
}

function ProductForm({ initial, onClose, onSubmit }) {
  const [form, setForm] = useState(
    initial || {
      nome: "",
      categoria: "",
      unidadeMedida: "un",
      custoUnitario: "",
      validade: "",
    }
  );

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.nome.trim() || !form.validade) return;
    onSubmit({
      nome: form.nome.trim(),
      categoria: form.categoria.trim(),
      unidadeMedida: form.unidadeMedida.trim() || "un",
      custoUnitario: Number(form.custoUnitario) || 0,
      validade: form.validade,
    });
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{initial ? "Editar produto" : "Novo produto"}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="form">
          <label className="field">
            <span>Nome do produto</span>
            <input
              required
              value={form.nome}
              onChange={(e) => update("nome", e.target.value)}
              placeholder="Ex: Álcool em gel 500ml"
            />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Categoria</span>
              <input
                value={form.categoria}
                onChange={(e) => update("categoria", e.target.value)}
                placeholder="Ex: Higiene"
              />
            </label>
            <label className="field field-sm">
              <span>Unidade</span>
              <input
                value={form.unidadeMedida}
                onChange={(e) => update("unidadeMedida", e.target.value)}
                placeholder="un, kg, cx…"
              />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Custo unitário (R$)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.custoUnitario}
                onChange={(e) => update("custoUnitario", e.target.value)}
                placeholder="0,00"
              />
            </label>
          </div>
          <label className="field">
            <span>Data de validade</span>
            <input
              required
              type="date"
              value={form.validade}
              onChange={(e) => update("validade", e.target.value)}
            />
          </label>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              {initial ? "Salvar alterações" : "Cadastrar produto"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmDialog({ title, message, confirmLabel, danger, onCancel, onConfirm }) {
  return (
    <div className="modal-overlay" onMouseDown={onCancel}>
      <div className="modal modal-sm" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onCancel} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <p className="hint-text">{message}</p>
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Movimentações
// ---------------------------------------------------------------------------
function Movimentacoes({ isMatriz, selectedUnit, products, unitsData, onRegister }) {
  const [targetUnit, setTargetUnit] = useState(selectedUnit);
  useEffect(() => setTargetUnit(selectedUnit), [selectedUnit]);

  const [productId, setProductId] = useState("");
  const [tipo, setTipo] = useState("entrada");
  const [quantidade, setQuantidade] = useState("");
  const [data, setData] = useState(todayISO());
  const [obs, setObs] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const movimentosVisiveis = useMemo(() => {
    const unitIds = isMatriz ? UNITS.map((u) => u.id) : [selectedUnit];
    const rows = [];
    unitIds.forEach((uId) => {
      (unitsData[uId]?.movements || []).forEach((m) => rows.push({ ...m, unitId: uId }));
    });
    return rows.sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 40);
  }, [isMatriz, selectedUnit, unitsData]);

  function productName(id) {
    return products.find((p) => p.id === id)?.nome || "Produto removido";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!productId || !quantidade || Number(quantidade) <= 0) return;
    setSubmitting(true);
    await onRegister(targetUnit, { productId, tipo, quantidade, data, obs });
    setSubmitting(false);
    setQuantidade("");
    setObs("");
  }

  if (products.length === 0) {
    return (
      <div className="panel">
        <EmptyState
          title="Nenhum produto cadastrado"
          desc="Cadastre produtos na aba Produtos antes de registrar movimentações."
        />
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <div className="panel">
        <div className="panel-header">
          <h3>Registrar movimentação</h3>
        </div>
        <form onSubmit={handleSubmit} className="form">
          <div className="field-row">
            {isMatriz && (
              <label className="field">
                <span>Unidade</span>
                <select value={targetUnit} onChange={(e) => setTargetUnit(e.target.value)}>
                  {UNITS.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              <span>Produto</span>
              <select
                required
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                <option value="" disabled>
                  Selecione…
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="field-row">
            <label className="field field-sm">
              <span>Tipo</span>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option value="entrada">Entrada</option>
                <option value="saida">Saída</option>
              </select>
            </label>
            <label className="field field-sm">
              <span>Quantidade</span>
              <input
                required
                type="number"
                min="1"
                step="1"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </label>
            <label className="field field-sm">
              <span>Data</span>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>Observação (opcional)</span>
            <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex: NF 12345" />
          </label>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? <Loader2 size={14} className="spin" /> : <Plus size={15} />}
              Registrar
            </button>
          </div>
        </form>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3>{isMatriz ? "Últimas movimentações (todas as unidades)" : "Últimas movimentações"}</h3>
        </div>
        {movimentosVisiveis.length === 0 ? (
          <EmptyState title="Sem movimentações" desc="As movimentações registradas aparecerão aqui." />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Produto</th>
                {isMatriz && <th>Unidade</th>}
                <th>Tipo</th>
                <th className="num">Quantidade</th>
                <th>Observação</th>
              </tr>
            </thead>
            <tbody>
              {movimentosVisiveis.map((m) => (
                <tr key={`${m.unitId}-${m.id}`}>
                  <td className="mono cell-muted">{formatDateBR(m.data)}</td>
                  <td className="cell-strong">{productName(m.productId)}</td>
                  {isMatriz && <td className="cell-muted">{unitLabel(m.unitId)}</td>}
                  <td>
                    <span className={`badge ${m.tipo === "entrada" ? "badge-success" : "badge-neutral"}`}>
                      {m.tipo === "entrada" ? "Entrada" : "Saída"}
                    </span>
                  </td>
                  <td className="num mono">{formatNum(m.quantidade)}</td>
                  <td className="cell-muted">{m.obs || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pedido de compra sugerido
// ---------------------------------------------------------------------------
function PedidoCompra({ suggestions, totalCost, itemCount }) {
  return (
    <div className="stack-lg">
      <div className="cards-grid cards-grid-3">
        <StatCard
          icon={<ShoppingCart size={16} />}
          label="Itens a comprar"
          value={formatNum(itemCount)}
          tone={itemCount ? "warning" : "neutral"}
        />
        <StatCard
          icon={<Package size={16} />}
          label="Produtos monitorados"
          value={formatNum(suggestions.length)}
        />
        <StatCard
          icon={<AlertTriangle size={16} />}
          label="Custo estimado do pedido"
          value={formatBRL(totalCost)}
        />
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3>Sugestão de pedido — segurança de 60 dias + 45 dias de consumo</h3>
        </div>
        <p className="hint-text">
          Cálculo: consumo médio diário (saídas dos últimos 90 dias, todas as unidades) × (60 dias
          de estoque de segurança + 45 dias de cobertura até a próxima compra chegar) − estoque
          atual consolidado. Produtos vencidos entram com estoque disponível zerado, já que não
          podem ser utilizados.
        </p>

        {suggestions.length === 0 ? (
          <EmptyState
            title="Nada para calcular ainda"
            desc="Cadastre produtos e registre movimentações para gerar sugestões de compra."
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Validade</th>
                <th className="num">Estoque atual</th>
                <th className="num">Consumo médio/dia</th>
                <th className="num">Segurança (60d)</th>
                <th className="num">Cobertura (45d)</th>
                <th className="num">Sugestão de compra</th>
                <th className="num">Custo estimado</th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map((s) => (
                <tr key={s.product.id} className={s.sugestao > 0 ? "row-highlight" : ""}>
                  <td className="cell-strong">{s.product.nome}</td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="num mono">
                    {formatNum(s.totalStock)} {s.product.unidadeMedida}
                  </td>
                  <td className="num mono">{s.consumoDiario.toFixed(2)}</td>
                  <td className="num mono">{formatNum(Math.ceil(s.estoqueSeguranca))}</td>
                  <td className="num mono">{formatNum(Math.ceil(s.necessidadeConsumo))}</td>
                  <td className="num mono cell-strong">
                    {s.sugestao > 0 ? formatNum(s.sugestao) : "—"}
                  </td>
                  <td className="num mono">{s.sugestao > 0 ? formatBRL(s.custoEstimado) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------
const css = `
:root {
  --bg: #10141b;
  --surface: #171c25;
  --surface-2: #1e2530;
  --border: #2b3341;
  --text: #e7eaee;
  --text-muted: #8d96a6;
  --text-faint: #5c6472;
  --accent: #4c7dff;
  --accent-soft: rgba(76,125,255,0.14);
  --danger: #e5484d;
  --danger-soft: rgba(229,72,77,0.14);
  --warning: #f0a93a;
  --warning-soft: rgba(240,169,58,0.14);
  --success: #35c48d;
  --success-soft: rgba(53,196,141,0.14);
}
* { box-sizing: border-box; }
.shell {
  display: flex;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
}
.mono { font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace; font-variant-numeric: tabular-nums; }

/* Sidebar */
.sidebar {
  width: 244px;
  flex-shrink: 0;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 20px 14px;
  gap: 22px;
}
.brand { display: flex; align-items: center; gap: 10px; padding: 0 6px; }
.brand-mark {
  width: 32px; height: 32px; border-radius: 8px;
  background: var(--accent-soft); color: var(--accent);
  display: flex; align-items: center; justify-content: center;
}
.brand-title { font-weight: 600; font-size: 13.5px; letter-spacing: -0.01em; }
.brand-sub { font-size: 11.5px; color: var(--text-faint); margin-top: 1px; }

.nav { display: flex; flex-direction: column; gap: 2px; }
.nav-item {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 10px; border-radius: 7px;
  background: none; border: none; color: var(--text-muted);
  font-size: 13.5px; font-family: inherit; cursor: pointer; text-align: left;
  transition: background .12s ease, color .12s ease;
}
.nav-item:hover { background: var(--surface-2); color: var(--text); }
.nav-item.is-active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.nav-badge {
  margin-left: auto; background: var(--warning-soft); color: var(--warning);
  font-size: 10.5px; font-weight: 700; padding: 1px 6px; border-radius: 20px;
}

.unit-switcher { margin-top: auto; padding: 12px 6px 4px; border-top: 1px solid var(--border); }
.unit-label { display: block; font-size: 10.5px; color: var(--text-faint); text-transform: uppercase; letter-spacing: .04em; margin-bottom: 7px; }
.unit-select-wrap {
  position: relative; display: flex; align-items: center; gap: 8px;
  background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px;
  padding: 8px 10px; color: var(--text-muted);
}
.unit-select {
  appearance: none; background: none; border: none; color: var(--text);
  font-family: inherit; font-size: 13px; font-weight: 600; flex: 1; cursor: pointer; outline: none;
}
.unit-select option { background: var(--surface); color: var(--text); }
.unit-caret { color: var(--text-faint); pointer-events: none; }
.unit-hint { font-size: 11.5px; color: var(--text-faint); line-height: 1.5; margin: 8px 2px 0; }

/* Content */
.content { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.topbar {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 14px 28px; border-bottom: 1px solid var(--border);
  position: sticky; top: 0; background: var(--bg); z-index: 5;
}
.topbar-status { flex: 1; min-width: 0; }
.topbar-spacer { height: 30px; }
.refresh-btn {
  display: flex; align-items: center; gap: 6px;
  background: var(--surface); border: 1px solid var(--border); color: var(--text-muted);
  font-family: inherit; font-size: 12.5px; font-weight: 600; padding: 7px 12px;
  border-radius: 7px; cursor: pointer;
}
.refresh-btn:hover { color: var(--text); border-color: var(--text-faint); }
.refresh-btn:disabled { opacity: .6; cursor: default; }

.banner {
  display: flex; align-items: center; gap: 8px; padding: 7px 12px;
  border-radius: 7px; font-size: 12.5px; width: fit-content; max-width: 100%;
}
.banner-error { background: var(--danger-soft); color: var(--danger); }
.banner-ok { background: var(--success-soft); color: var(--success); }
.banner-close { background: none; border: none; color: inherit; cursor: pointer; margin-left: 4px; opacity: .8; }

.tab-body { padding: 24px 28px 48px; flex: 1; }
.stack-lg { display: flex; flex-direction: column; gap: 20px; }
.stack-xs { display: flex; flex-direction: column; gap: 4px; }

.loading-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; padding: 100px 0; color: var(--text-muted); font-size: 13px;
}
.spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Cards */
.cards-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.cards-grid-3 { grid-template-columns: repeat(3, 1fr); }
.stat-card {
  display: flex; align-items: center; gap: 12px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px;
}
.stat-icon {
  width: 34px; height: 34px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--surface-2); color: var(--text-muted);
}
.tone-danger .stat-icon { background: var(--danger-soft); color: var(--danger); }
.tone-warning .stat-icon { background: var(--warning-soft); color: var(--warning); }
.stat-value { font-size: 19px; font-weight: 700; letter-spacing: -0.01em; font-family: 'JetBrains Mono', monospace; }
.stat-label { font-size: 11.5px; color: var(--text-faint); margin-top: 2px; }

/* Panels */
.panel { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px; }
.panel-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; gap: 10px; }
.panel-header h3 { font-size: 14px; font-weight: 650; margin: 0; letter-spacing: -0.005em; }
.hint-text { font-size: 12.5px; color: var(--text-muted); line-height: 1.6; margin: 0 0 14px; }

/* Table */
.table { width: 100%; border-collapse: collapse; font-size: 13px; }
.table th {
  text-align: left; font-size: 11px; font-weight: 600; color: var(--text-faint);
  text-transform: uppercase; letter-spacing: .03em; padding: 8px 10px; border-bottom: 1px solid var(--border);
}
.table td { padding: 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }
.table tbody tr:last-child td { border-bottom: none; }
.table .num { text-align: right; }
.table th.num { text-align: right; }
.col-expand { width: 26px; }
.col-actions { width: 70px; text-align: right; }
.cell-strong { font-weight: 600; }
.cell-muted { color: var(--text-muted); }
.row-highlight { background: rgba(240,169,58,0.05); }
.sub-row td { border-bottom: 1px solid var(--border); padding-top: 0; padding-bottom: 12px; }
.breakdown { display: flex; flex-wrap: wrap; gap: 8px; }
.breakdown-chip {
  background: var(--surface-2); border: 1px solid var(--border); border-radius: 20px;
  padding: 4px 10px; font-size: 12px; color: var(--text-muted);
}
.breakdown-chip strong { color: var(--text); font-family: 'JetBrains Mono', monospace; }

.expand-btn { background: none; border: none; color: var(--text-faint); cursor: pointer; display: flex; padding: 2px; }
.expand-btn:hover { color: var(--text); }

/* Badges */
.badge { display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 20px; font-size: 11px; font-weight: 650; white-space: nowrap; }
.badge-danger { background: var(--danger-soft); color: var(--danger); }
.badge-warning { background: var(--warning-soft); color: var(--warning); }
.badge-success { background: var(--success-soft); color: var(--success); }
.badge-neutral { background: var(--surface-2); color: var(--text-muted); }

/* Alerts */
.alert-list { display: flex; flex-direction: column; gap: 2px; }
.alert-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 7px; font-size: 12.5px; }
.alert-danger { background: var(--danger-soft); color: var(--danger); }
.alert-warning { background: var(--warning-soft); color: var(--warning); }
.alert-name { font-weight: 650; color: var(--text); }
.alert-meta { color: inherit; opacity: .85; margin-left: auto; font-size: 11.5px; }

/* Empty state */
.empty-state { padding: 36px 10px; text-align: center; }
.empty-title { font-weight: 650; margin: 0 0 4px; }
.empty-desc { color: var(--text-faint); font-size: 12.5px; margin: 0; }

/* Buttons */
.btn {
  display: inline-flex; align-items: center; gap: 6px; font-family: inherit;
  font-size: 12.5px; font-weight: 650; padding: 8px 14px; border-radius: 8px;
  border: 1px solid transparent; cursor: pointer;
}
.btn-primary { background: var(--accent); color: white; }
.btn-primary:hover { filter: brightness(1.08); }
.btn-primary:disabled { opacity: .6; cursor: default; }
.btn-ghost { background: none; border-color: var(--border); color: var(--text-muted); }
.btn-ghost:hover { color: var(--text); }
.btn-danger { background: var(--danger); color: white; }
.icon-btn {
  background: none; border: none; color: var(--text-faint); cursor: pointer;
  padding: 5px; border-radius: 6px; display: inline-flex;
}
.icon-btn:hover { background: var(--surface-2); color: var(--text); }
.icon-btn-danger:hover { color: var(--danger); }

/* Forms */
.form { display: flex; flex-direction: column; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 5px; flex: 1; }
.field-sm { flex: 0.6; }
.field span { font-size: 11.5px; color: var(--text-muted); font-weight: 600; }
.field input, .field select {
  background: var(--surface-2); border: 1px solid var(--border); border-radius: 7px;
  padding: 8px 10px; color: var(--text); font-family: inherit; font-size: 13px; outline: none;
}
.field input:focus, .field select:focus { border-color: var(--accent); }
.field-row { display: flex; gap: 12px; }
.form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }

/* Modal */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(8,10,14,0.6); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 50;
}
.modal {
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
  padding: 20px 22px; width: 100%; max-width: 460px; max-height: 88vh; overflow-y: auto;
}
.modal-sm { max-width: 380px; }
.modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.modal-header h3 { font-size: 15px; margin: 0; font-weight: 650; }

@media (max-width: 860px) {
  .shell { flex-direction: column; }
  .sidebar { width: 100%; flex-direction: row; align-items: center; flex-wrap: wrap; padding: 12px 16px; gap: 12px; }
  .nav { flex-direction: row; flex-wrap: wrap; }
  .unit-switcher { margin-top: 0; border-top: none; padding: 0; width: 100%; }
  .cards-grid, .cards-grid-3 { grid-template-columns: repeat(2, 1fr); }
  .tab-body { padding: 18px 16px 36px; }
  .topbar { padding: 12px 16px; }
}
`;
