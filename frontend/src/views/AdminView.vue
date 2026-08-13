<script setup>
import { ref, onMounted } from 'vue'
import api, { errMsg } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

const auth = useAuthStore()
const toast = useToastStore()

const users = ref([])
const codes = ref([])
const loadingUsers = ref(false)
const loadingCodes = ref(false)

/* ── 新邀请码展示 ── */
const newCode = ref('')
const generating = ref(false)

/* ── 重置密码弹窗 ── */
const resetTarget = ref(null)
const resetPassword = ref('')
const resetting = ref(false)

/* ── 删除确认弹窗 ── */
const deleteTarget = ref(null)
const deleting = ref(false)

function fmtTime(value) {
  if (!value) return '—'
  const d = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function fetchUsers() {
  loadingUsers.value = true
  try {
    const { data } = await api.get('/admin/users')
    users.value = data.data || []
  } catch (err) {
    toast.err(errMsg(err, '获取用户列表失败'))
  } finally {
    loadingUsers.value = false
  }
}

async function fetchCodes() {
  loadingCodes.value = true
  try {
    const { data } = await api.get('/admin/invite-codes')
    codes.value = data.data || []
  } catch (err) {
    toast.err(errMsg(err, '获取邀请码列表失败'))
  } finally {
    loadingCodes.value = false
  }
}

async function toggleDisabled(user) {
  const action = user.disabled ? 'enable' : 'disable'
  try {
    const { data } = await api.post(`/admin/users/${user.id}/${action}`)
    toast.ok(data.message || '操作成功')
    await fetchUsers()
  } catch (err) {
    toast.err(errMsg(err))
  }
}

function openReset(user) {
  resetTarget.value = user
  resetPassword.value = ''
}

async function confirmReset() {
  if (resetting.value) return
  if (!resetPassword.value || resetPassword.value.length < 8) {
    toast.warn('新密码至少 8 个字符')
    return
  }
  resetting.value = true
  try {
    const { data } = await api.post(`/admin/users/${resetTarget.value.id}/reset-password`, {
      new_password: resetPassword.value
    })
    toast.ok(data.message || '密码已重置')
    resetTarget.value = null
  } catch (err) {
    toast.err(errMsg(err))
  } finally {
    resetting.value = false
  }
}

function openDelete(user) {
  deleteTarget.value = user
}

async function confirmDelete() {
  if (deleting.value) return
  deleting.value = true
  try {
    const { data } = await api.delete(`/admin/users/${deleteTarget.value.id}`)
    toast.ok(data.message || '用户已删除')
    deleteTarget.value = null
    await fetchUsers()
  } catch (err) {
    toast.err(errMsg(err))
  } finally {
    deleting.value = false
  }
}

async function generateCode() {
  if (generating.value) return
  generating.value = true
  try {
    const { data } = await api.post('/admin/invite-codes')
    newCode.value = data.code
    toast.ok(data.message || '邀请码已生成')
    await fetchCodes()
  } catch (err) {
    toast.err(errMsg(err, '生成邀请码失败'))
  } finally {
    generating.value = false
  }
}

async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(code)
    toast.ok('已复制到剪贴板')
  } catch {
    toast.warn('复制失败，请手动复制')
  }
}

async function revokeCode(code) {
  try {
    const { data } = await api.delete(`/admin/invite-codes/${code}`)
    toast.ok(data.message || '邀请码已作废')
    if (newCode.value === code) newCode.value = ''
    await fetchCodes()
  } catch (err) {
    toast.err(errMsg(err))
  }
}

onMounted(() => {
  fetchUsers()
  fetchCodes()
})
</script>

<template>
  <div class="admin-view">
    <header class="admin-header">
      <h1 class="admin-title">后台管理</h1>
      <p class="admin-sub">用户与邀请码管理</p>
    </header>

    <!-- ═══ 用户管理 ═══ -->
    <section class="admin-section">
      <div class="section-head">
        <h2 class="section-title">用户管理</h2>
        <button class="btn btn-ghost btn-sm" @click="fetchUsers" :disabled="loadingUsers">
          {{ loadingUsers ? '刷新中…' : '刷新' }}
        </button>
      </div>

      <div class="admin-card">
        <table class="admin-table">
          <thead>
            <tr>
              <th>用户名</th>
              <th>昵称</th>
              <th>邮箱</th>
              <th>角色</th>
              <th>状态</th>
              <th>注册时间</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id" :class="{ 'row-disabled': u.disabled }">
              <td class="col-username">
                {{ u.username }}
                <span v-if="u.id === auth.user?.id" class="tag tag-self">我</span>
              </td>
              <td class="col-nickname">{{ u.nickname || u.username }}</td>
              <td class="col-email">{{ u.email || '—' }}</td>
              <td>
                <span class="tag" :class="u.role === 'admin' ? 'tag-admin' : 'tag-user'">
                  {{ u.role === 'admin' ? '管理员' : '用户' }}
                </span>
              </td>
              <td>
                <span class="tag" :class="u.disabled ? 'tag-off' : 'tag-on'">
                  {{ u.disabled ? '已禁用' : '正常' }}
                </span>
                <span v-if="u.is_guest" class="tag tag-guest">游客</span>
              </td>
              <td class="col-time">{{ fmtTime(u.created_at) }}</td>
              <td class="col-actions">
                <button
                  class="btn btn-sm"
                  :class="u.disabled ? 'btn-secondary' : 'btn-danger'"
                  :disabled="u.id === auth.user?.id"
                  @click="toggleDisabled(u)"
                >{{ u.disabled ? '启用' : '禁用' }}</button>
                <button class="btn btn-secondary btn-sm" @click="openReset(u)">重置密码</button>
                <button
                  class="btn btn-danger btn-sm"
                  :disabled="u.id === auth.user?.id"
                  @click="openDelete(u)"
                >删除</button>
              </td>
            </tr>
            <tr v-if="!users.length && !loadingUsers">
              <td colspan="7" class="table-empty">暂无用户</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ═══ 邀请码 ═══ -->
    <section class="admin-section">
      <div class="section-head">
        <h2 class="section-title">邀请码</h2>
        <button class="btn btn-primary btn-sm" @click="generateCode" :disabled="generating">
          {{ generating ? '生成中…' : '生成邀请码' }}
        </button>
      </div>

      <div v-if="newCode" class="new-code-box">
        <span class="new-code-label">新邀请码</span>
        <code class="new-code-value">{{ newCode }}</code>
        <button class="btn btn-secondary btn-sm" @click="copyCode(newCode)">复制</button>
      </div>

      <div class="admin-card">
        <table class="admin-table">
          <thead>
            <tr>
              <th>邀请码</th>
              <th>状态</th>
              <th>创建时间</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in codes" :key="c.id">
              <td><code class="code-text">{{ c.code }}</code></td>
              <td>
                <span v-if="c.used_by" class="tag tag-off">已使用 · {{ c.used_by }}</span>
                <span v-else class="tag tag-on">未使用</span>
              </td>
              <td class="col-time">{{ fmtTime(c.created_at) }}</td>
              <td class="col-actions">
                <button class="btn btn-ghost btn-sm" @click="copyCode(c.code)">复制</button>
                <button v-if="!c.used_by" class="btn btn-danger btn-sm" @click="revokeCode(c.code)">
                  作废
                </button>
              </td>
            </tr>
            <tr v-if="!codes.length && !loadingCodes">
              <td colspan="4" class="table-empty">暂无邀请码</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ═══ 重置密码弹窗 ═══ -->
    <div v-if="resetTarget" class="modal-mask" @click.self="resetTarget = null">
      <div class="modal-card">
        <h3 class="modal-title">重置密码</h3>
        <p class="modal-desc">为用户 <strong>{{ resetTarget.username }}</strong> 设置新密码（至少 8 个字符）。</p>
        <input
          v-model="resetPassword"
          class="modal-input"
          type="password"
          placeholder="请输入新密码"
          autocomplete="new-password"
          @keydown.enter="confirmReset"
        />
        <div class="modal-actions">
          <button class="btn btn-ghost" @click="resetTarget = null">取消</button>
          <button class="btn btn-primary" @click="confirmReset" :disabled="resetting">
            {{ resetting ? '提交中…' : '确认重置' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ═══ 删除确认弹窗 ═══ -->
    <div v-if="deleteTarget" class="modal-mask" @click.self="deleteTarget = null">
      <div class="modal-card">
        <h3 class="modal-title">删除用户</h3>
        <p class="modal-desc">
          确定删除用户 <strong>{{ deleteTarget.username }}</strong> 吗？
          该用户的所有数据（计划、账目、心情记录等）将被一并清除，此操作不可恢复。
        </p>
        <div class="modal-actions">
          <button class="btn btn-ghost" @click="deleteTarget = null">取消</button>
          <button class="btn btn-danger-solid" @click="confirmDelete" :disabled="deleting">
            {{ deleting ? '删除中…' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-view {
  max-width: 880px;
  margin: 0 auto;
  padding: var(--space-6) 0 var(--space-12);
}

.admin-header {
  margin-bottom: var(--space-8);
}

.admin-title {
  font-family: var(--font-heading);
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--text-primary);
}

.admin-sub {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-top: var(--space-2);
  letter-spacing: 0.08em;
}

.admin-section {
  margin-bottom: var(--space-8);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}

.section-title {
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text-primary);
}

.admin-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow-x: auto;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.admin-table th {
  text-align: left;
  padding: var(--space-3) var(--space-4);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.admin-table td {
  padding: var(--space-3) var(--space-4);
  color: var(--text-primary);
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}

.admin-table tbody tr:last-child td {
  border-bottom: none;
}

.row-disabled td {
  opacity: 0.55;
}

.col-username {
  font-weight: 500;
  white-space: nowrap;
}

.col-nickname {
  color: var(--text-secondary);
  white-space: nowrap;
}

.col-email {
  color: var(--text-secondary);
}

.col-time {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  white-space: nowrap;
}

.col-actions {
  white-space: nowrap;
}

.col-actions .btn {
  margin-right: var(--space-2);
}

.col-actions .btn:last-child {
  margin-right: 0;
}

.table-empty {
  text-align: center;
  color: var(--text-muted);
  padding: var(--space-8) !important;
}

.tag {
  display: inline-block;
  padding: 2px var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  white-space: nowrap;
}

.tag-admin {
  background: var(--accent-muted);
  color: var(--accent);
}

.tag-user {
  background: var(--bg-muted);
  color: var(--text-secondary);
}

.tag-on {
  background: var(--success-bg);
  color: var(--success);
}

.tag-off {
  background: var(--danger-bg);
  color: var(--danger);
}

.tag-guest {
  background: var(--warning-bg);
  color: var(--warning);
  margin-left: var(--space-1);
}

.tag-self {
  background: var(--info-bg);
  color: var(--info);
  margin-left: var(--space-1);
}

.new-code-box {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  margin-bottom: var(--space-4);
  background: var(--success-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.new-code-label {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.new-code-value {
  font-family: var(--font-data);
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.08em;
}

.code-text {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--text-primary);
}

/* ── Modals ── */
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  background: rgba(30, 32, 48, 0.32);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.modal-card {
  width: 100%;
  max-width: 380px;
  padding: var(--space-6);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
}

.modal-title {
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--space-3);
}

.modal-desc {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: var(--space-4);
}

.modal-input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  margin-bottom: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  background: var(--bg);
  color: var(--text-primary);
}

.modal-input:focus {
  outline: none;
  border-color: var(--accent);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.btn-danger-solid {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 500;
  background: var(--danger);
  color: var(--text-inverse);
  transition: opacity var(--duration-fast) var(--ease-out);
}

.btn-danger-solid:hover {
  opacity: 0.88;
}

.btn-danger-solid:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
