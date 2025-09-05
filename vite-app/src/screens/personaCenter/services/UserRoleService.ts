// UserRole业务服务层
// 封装UserRole相关的业务逻辑和数据操作

import type { 
  UserRole, 
  CreateUserRoleInput, 
  UpdateUserRoleInput, 
  FilterOptions, 
  SearchOptions 
} from '../types/PersonaTypes';

// 导入数据库操作函数
import { 
  getAllUserRoles, 
  getUserRoleById, 
  saveUserRole, 
  deleteUserRole, 
  searchUserRoles,
  setGlobalDefaultUserRole,
  updateUserRoleLastUsedAt 
} from '../../../database/index';

// 导入状态管理函数
import {
  setUserRoles,
  addUserRole,
  updateUserRole as updateUserRoleState,
  removeUserRole,
  setActiveUserRoleId
} from '../../../state/index';

export class UserRoleService {
  // 获取所有UserRole
  async getAll(): Promise<UserRole[]> {
    try {
      const userRoles = await getAllUserRoles();
      // 按最近使用时间排序，全局默认置顶
      return userRoles.sort((a, b) => {
        if (a.isGlobalDefault) return -1;
        if (b.isGlobalDefault) return 1;
        return b.lastUsedAt - a.lastUsedAt;
      });
    } catch (error) {
      console.error('获取UserRoles失败:', error);
      throw new Error('获取用户角色列表失败');
    }
  }

  // 根据ID获取UserRole
  async getById(id: string): Promise<UserRole | null> {
    try {
      const userRole = await getUserRoleById(id);
      return userRole || null;
    } catch (error) {
      console.error('获取UserRole失败:', error);
      throw new Error(`获取用户角色失败: ${id}`);
    }
  }

  // 创建新UserRole
  async create(input: CreateUserRoleInput): Promise<UserRole> {
    try {
      const now = Date.now();
      
      // 确保input不包含id，防止覆盖新生成的ID
      const { id: _, ...safeInput } = input as any;
      
      const userRole: UserRole = {
        id: 'user_role_' + now,
        ...safeInput,
        type: 'user' as const,
        createdAt: now,
        updatedAt: now,
        lastUsedAt: now
      };

      // 保存到数据库
      await saveUserRole(userRole);
      
      // 更新状态
      addUserRole(userRole);
      
      console.log('创建UserRole成功:', userRole.name);
      return userRole;
    } catch (error) {
      console.error('创建UserRole失败:', error);
      throw new Error('创建用户角色失败');
    }
  }

  // 更新UserRole
  async update(id: string, input: UpdateUserRoleInput): Promise<void> {
    try {
      const existingUserRole = await this.getById(id);
      if (!existingUserRole) {
        throw new Error('用户角色不存在');
      }

      const updatedUserRole: UserRole = {
        ...existingUserRole,
        ...input,
        updatedAt: Date.now()
      };

      // 保存到数据库
      await saveUserRole(updatedUserRole);
      
      // 更新状态
      updateUserRoleState(id, updatedUserRole);
      
      console.log('更新UserRole成功:', id);
    } catch (error) {
      console.error('更新UserRole失败:', error);
      throw new Error('更新用户角色失败');
    }
  }

  // 删除UserRole
  async delete(id: string): Promise<void> {
    try {
      const userRole = await this.getById(id);
      if (!userRole) {
        throw new Error('用户角色不存在');
      }

      // 检查是否为全局默认角色
      if (userRole.isGlobalDefault) {
        throw new Error('无法删除全局默认用户角色');
      }

      // 检查是否被聊天引用
      const referenceCheck = await this.checkReferences(id);
      if (referenceCheck.isReferenced) {
        throw new Error(`无法删除用户角色，正被以下项引用：${referenceCheck.referencedBy.join(', ')}`);
      }

      await deleteUserRole(id);
      removeUserRole(id);
      
      console.log('删除UserRole成功:', id);
    } catch (error) {
      console.error('删除UserRole失败:', error);
      throw new Error('删除用户角色失败');
    }
  }

  // 搜索和筛选UserRole
  async search(options: SearchOptions): Promise<UserRole[]> {
    try {
      const { term, filters } = options;
      
      if (!term.trim() && !filters) {
        return await this.getAll();
      }

      let results: UserRole[];

      if (term.trim()) {
        // 使用数据库搜索
        results = await searchUserRoles(term, {});
      } else {
        // 仅筛选
        const allUserRoles = await this.getAll();
        results = this.applyFilters(allUserRoles, filters || {});
      }

      // 保持排序：全局默认置顶，然后按最近使用时间
      return results.sort((a, b) => {
        if (a.isGlobalDefault) return -1;
        if (b.isGlobalDefault) return 1;
        return b.lastUsedAt - a.lastUsedAt;
      });
    } catch (error) {
      console.error('搜索UserRoles失败:', error);
      throw new Error('搜索用户角色失败');
    }
  }

  // 设置全局默认UserRole
  async setGlobalDefault(id: string): Promise<void> {
    try {
      const userRole = await this.getById(id);
      if (!userRole) {
        throw new Error('用户角色不存在');
      }

      // 数据库层已处理清除其他默认状态的逻辑
      await setGlobalDefaultUserRole(id);
      
      // 更新本地状态：先清除所有默认状态，再设置新的
      const state = (window as any).state;
      if (state) {
        state.userRoles.forEach((ur: UserRole) => {
          if (ur.isGlobalDefault) {
            updateUserRoleState(ur.id, { isGlobalDefault: false });
          }
        });
        updateUserRoleState(id, { isGlobalDefault: true });
      }
      
      console.log('设置全局默认UserRole成功:', id);
    } catch (error) {
      console.error('设置全局默认UserRole失败:', error);
      throw new Error('设置全局默认失败');
    }
  }

  // 获取当前全局默认UserRole
  async getGlobalDefault(): Promise<UserRole | null> {
    try {
      const allUserRoles = await this.getAll();
      return allUserRoles.find(ur => ur.isGlobalDefault) || null;
    } catch (error) {
      console.error('获取全局默认UserRole失败:', error);
      return null;
    }
  }

  // 更新最后使用时间
  async updateLastUsedAt(id: string): Promise<void> {
    try {
      await updateUserRoleLastUsedAt(id);
      updateUserRoleState(id, { lastUsedAt: Date.now() });
    } catch (error) {
      console.error('更新最后使用时间失败:', error);
      // 不抛出错误，这是非关键操作
    }
  }

  // 复制UserRole
  async duplicate(id: string, newName?: string): Promise<UserRole> {
    try {
      const originalUserRole = await this.getById(id);
      if (!originalUserRole) {
        throw new Error('源用户角色不存在');
      }

      const duplicatedInput: CreateUserRoleInput = {
        ...originalUserRole,
        name: newName || `${originalUserRole.name} (副本)`,
        isGlobalDefault: false, // 副本不能是全局默认
        archived: false
      };

      // 移除不应该复制的字段
      delete (duplicatedInput as any).id;
      delete (duplicatedInput as any).type;
      delete (duplicatedInput as any).createdAt;
      delete (duplicatedInput as any).updatedAt;
      delete (duplicatedInput as any).lastUsedAt;

      return await this.create(duplicatedInput);
    } catch (error) {
      console.error('复制UserRole失败:', error);
      throw new Error('复制用户角色失败');
    }
  }

  // 批量操作
  async bulkDelete(ids: string[]): Promise<{ success: string[], failed: string[] }> {
    const success: string[] = [];
    const failed: string[] = [];

    for (const id of ids) {
      try {
        await this.delete(id);
        success.push(id);
      } catch (error) {
        console.error(`批量删除失败 ${id}:`, error);
        failed.push(id);
      }
    }

    return { success, failed };
  }

  // 初始化默认UserRole（应用启动时调用）
  async ensureDefaultUserRole(): Promise<UserRole> {
    try {
      let defaultUserRole = await this.getGlobalDefault();
      
      if (!defaultUserRole) {
        console.log('未找到全局默认UserRole，创建默认角色');
        defaultUserRole = await this.create({
          name: '默认用户',
          avatar: '',
          tags: [],
          prompt: {
            persona: '我是一个普通用户',
            style: '自然、友好'
          },
          archived: false,
          isGlobalDefault: true
        });
        await this.setGlobalDefault(defaultUserRole.id);
      }
      
      return defaultUserRole;
    } catch (error) {
      console.error('确保默认UserRole失败:', error);
      throw new Error('初始化默认用户角色失败');
    }
  }

  // 私有辅助方法
  private applyFilters(userRoles: UserRole[], filters: FilterOptions): UserRole[] {
    let filtered = userRoles;

    if (filters.type === 'user') {
      filtered = filtered.filter(ur => ur.type === 'user');
    }

    if (filters.tags && filters.tags.length > 0) {
      filtered = filtered.filter(ur => 
        filters.tags!.some(tag => ur.tags.includes(tag))
      );
    }

    return filtered;
  }

  // 验证UserRole数据
  validateUserRole(input: CreateUserRoleInput | UpdateUserRoleInput): { isValid: boolean, errors: string[] } {
    const errors: string[] = [];

    if ('name' in input) {
      if (!input.name?.trim()) {
        errors.push('用户角色名称不能为空');
      } else if (input.name.trim().length > 100) {
        errors.push('用户角色名称不能超过100个字符');
      }
    }

    if ('prompt' in input && input.prompt) {
      // 检查definition字段（新标准），回退检查persona字段（兼容旧数据）
      const definition = input.prompt.definition || input.prompt.persona;
      if (!definition?.trim()) {
        errors.push('角色描述不能为空');
      }
    }

    if ('tags' in input && input.tags) {
      if (input.tags.length > 20) {
        errors.push('标签数量不能超过20个');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // 检查引用关系（实现引用保护）
  private async checkReferences(userRoleId: string): Promise<{ isReferenced: boolean; referencedBy: string[] }> {
    try {
      // 检查是否被聊天引用
      const state = (window as any).STATE || (window as any).state;
      const chats = state?.state?.chats || {};
      const referencedBy: string[] = [];

      // 遍历所有聊天，检查defaultUserRoleId引用
      Object.values(chats).forEach((chat: any) => {
        if (chat.defaultUserRoleId === userRoleId) {
          referencedBy.push(`聊天: ${chat.name}`);
        }
        // 检查消息级引用
        if (chat.history && Array.isArray(chat.history)) {
          const messageCount = chat.history.filter((msg: any) => msg.userRoleId === userRoleId).length;
          if (messageCount > 0) {
            referencedBy.push(`聊天 ${chat.name} 的 ${messageCount} 条消息`);
          }
        }
      });

      return {
        isReferenced: referencedBy.length > 0,
        referencedBy
      };
    } catch (error) {
      console.error('检查引用关系失败:', error);
      return { isReferenced: false, referencedBy: [] };
    }
  }
}