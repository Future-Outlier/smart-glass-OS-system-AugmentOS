/*
 * @Author       : XK
 * @Date         : 2025-05-10 14:20:34
 * @LastEditTime : 2025-07-11 16:08:35
 * @FilePath     : bal_os.c
 * @Description  :
 *
 * Copyright (c) XingYiZhiNeng 2025 , All Rights Reserved.
 */

#include "bal_os.h"

#define TAG "BAL_OS"





void xyzn_os_busy_wait(uint32_t us)
{
    k_busy_wait(us);
}
void xyzn_os_delay_ms(uint32_t ms)
{
    k_sleep(K_MSEC(ms));
}
void xyzn_os_delay_us(uint32_t us)
{
    k_sleep(K_USEC(us));
}
xyzn_os_tick_t xyzn_os_get_tick(void)
{
    // return k_uptime_get_32();
    return k_uptime_ticks();
}
int64_t xyzn_os_uptime_get(void)
{
    return k_uptime_get();
}
void xuzn_os_reset(void)
{
    sys_reboot(0);
}
void *xyzn_malloc(size_t size)
{
    void *p = NULL;
    p = k_malloc(size);
    if (p == NULL)
    {
        BSP_LOGE(TAG, "malloc err!!!");
        return NULL;
    }
    return p;
}
void xyzn_free(void *ptr)
{
    k_free(ptr);
}

int xyzn_os_timer_start(struct k_timer *timer_handle, bool auto_reload, int64_t period)
{
    if (timer_handle == NULL)
    {
        BSP_LOGE(TAG, "timer start err!!!");
        return XYZN_OS_ERROR;
    }
    if (auto_reload == true)
    {
        k_timer_start(timer_handle, K_MSEC(period), K_MSEC(period));
    }
    else
    {
        k_timer_start(timer_handle, K_MSEC(period), K_NO_WAIT);
    }
    return XYZN_OS_EOK;
}
int xyzn_os_timer_stop(struct k_timer *timer_handle)
{
    if (timer_handle == NULL)
    {
        BSP_LOGE(TAG, "timer stop err!!!");
        return XYZN_OS_ERROR;
    }
    k_timer_stop(timer_handle);
    return XYZN_OS_EOK;
}
int xyzn_os_timer_create(struct k_timer *timer_handle, void (*callback)(struct k_timer *timer))
{
    if (timer_handle == NULL)
    {
        BSP_LOGE(TAG, "timer init err!!!");
        return XYZN_OS_ERROR;
    }
    k_timer_init(timer_handle, callback, NULL);
    return XYZN_OS_EOK;
}
int xyzn_os_mutex_create_init(struct k_mutex *mutex)
{
    if (mutex == NULL)
    {
        BSP_LOGE(TAG, "mutex create init err!!!");
        return XYZN_OS_ERROR;
    }
    return k_mutex_init(mutex);
}
int xyzn_os_mutex_lock(struct k_mutex *mutex, int64_t time)
{
    k_mutex_lock(mutex, K_FOREVER);

    if (mutex == NULL)
    {
        BSP_LOGE(TAG, "mutex lock err!!!");
        return XYZN_OS_ERROR;
    }
    int32_t ret = XYZN_OS_ERROR;
    if (time == XYZN_OS_WAIT_FOREVER)
    {
        ret = k_mutex_lock(mutex, K_FOREVER);
    }
    else if (time == XYZN_OS_WAIT_ON)
    {
        ret = k_mutex_lock(mutex, K_NO_WAIT);
    }
    else
    {
        ret = k_mutex_lock(mutex, K_MSEC(time));
    }
    return ret;
}
int xyzn_os_mutex_unlock(struct k_mutex *mutex)
{
    if (mutex == NULL)
    {
        BSP_LOGE(TAG, "mutex unlock err!!!");
        return XYZN_OS_ERROR;
    }
    return k_mutex_unlock(mutex);
}

int xyzn_os_sem_give(struct k_sem *sem)
{
    if (sem == NULL)
    {
        BSP_LOGE(TAG, "sem give err!!!");
        return XYZN_OS_ERROR;
    }
    k_sem_give(sem);
    return XYZN_OS_EOK;
}

int xyzn_os_sem_take(struct k_sem *sem, int64_t time)
{
    if (sem == NULL)
    {
        BSP_LOGE(TAG, "sem take err!!!");
        return XYZN_OS_ERROR;
    }
    int32_t ret = XYZN_OS_ERROR;
    if (time == XYZN_OS_WAIT_FOREVER)
    {
        ret = k_sem_take(sem, K_FOREVER);
    }
    else if (time == XYZN_OS_WAIT_ON)
    {
        ret = k_sem_take(sem, K_NO_WAIT);
    }
    else
    {
        ret = k_sem_take(sem, K_MSEC(time));
    }
    return ret;
}
int xyzn_os_msgq_receive(struct k_msgq *msgq, void *msg, int64_t timeout)
{
    if (msgq == NULL)
    {
        BSP_LOGE(TAG, "msgq receive err!!!");
        return XYZN_OS_ERROR;
    }
    k_timeout_t time_v;
    if (timeout == XYZN_OS_WAIT_FOREVER)
    {
        time_v = K_FOREVER;
    }
    else if (timeout == XYZN_OS_WAIT_ON)
    {
        time_v = K_NO_WAIT;
    }
    else
    {
        time_v = K_MSEC(timeout);
    }
    return k_msgq_get(msgq, msg, time_v);
}
int xyzn_os_msgq_send(struct k_msgq *msgq, void *msg, int64_t timeout)
{
    if (msgq == NULL)
    {
        BSP_LOGE(TAG, "msgq send err!!!");
        return XYZN_OS_ERROR;
    }
    k_timeout_t time_v;
    if (timeout == XYZN_OS_WAIT_FOREVER)
    {
        time_v = K_FOREVER;
    }
    else if (timeout == XYZN_OS_WAIT_ON)
    {
        time_v = K_NO_WAIT;
    }
    else
    {
        time_v = K_MSEC(timeout);
    }

    return k_msgq_put(msgq, msg, time_v);
}